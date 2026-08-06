import { PermissionsAndroid, Platform } from 'react-native';
import { notificationsApi } from '@/api/endpoints';
import { navigationRef } from '@/navigation/navigationRef';
import { queryClient } from '@/query/queryClient';
import { queryKeys } from '@/shared/query/queryKeys';

// Firebase Messaging is a native module: absent on web and in Expo Go, so it is lazily
// required and every entry point degrades to a no-op rather than throwing. Same pattern
// as services/analytics.ts.
type MessagingModule = {
  getMessaging: (...args: unknown[]) => unknown;
  getToken: (messaging: unknown) => Promise<string>;
  deleteToken: (messaging: unknown) => Promise<void>;
  onTokenRefresh: (messaging: unknown, listener: (token: string) => void) => () => void;
  onNotificationOpenedApp: (messaging: unknown, listener: (message: RemoteMessageLike) => void) => () => void;
  getInitialNotification: (messaging: unknown) => Promise<RemoteMessageLike | null>;
  onMessage: (messaging: unknown, listener: (message: RemoteMessageLike) => void) => () => void;
  requestPermission: (messaging: unknown) => Promise<number>;
};

type RemoteMessageLike = { data?: Record<string, string | undefined> };

let modular: MessagingModule | null = null;
let loadTried = false;
// The token currently registered with the API, so logout knows what to unregister.
let registeredToken: string | null = null;
// Why push is not working, for the settings screen and for support. Every failure below used
// to be swallowed into a bare `false`, which made a dead registration indistinguishable from
// a working one.
export type PushStatus = 'unknown' | 'registered' | 'denied' | 'unsupported' | 'failed';
let status: PushStatus = 'unknown';

export const getPushStatus = (): PushStatus => status;

const loadMessaging = (): MessagingModule | null => {
  if (modular || loadTried) return modular;
  loadTried = true;
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modular = require('@react-native-firebase/messaging') as MessagingModule;
  } catch {
    modular = null;
  }
  return modular;
};

/**
 * Android 13+ needs the runtime POST_NOTIFICATIONS grant; older Android is granted at
 * install time. iOS goes through Firebase's own prompt.
 */
const ensurePermission = async (messaging: MessagingModule, instance: unknown) => {
  if (Platform.OS === 'android') {
    if (Number(Platform.Version) < 33) return true;
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  // AuthorizationStatus: 1 = AUTHORIZED, 2 = PROVISIONAL.
  const status = await messaging.requestPermission(instance);
  return status === 1 || status === 2;
};

const sendTokenToServer = async (token: string) => {
  if (!token || token === registeredToken) return;
  await notificationsApi.registerDevice(token, Platform.OS === 'ios' ? 'ios' : 'android');
  registeredToken = token;
};

/**
 * Asks for permission (once the user is signed in — never at first launch) and registers
 * this device against the active business. Safe to call repeatedly: registering the same
 * token again is a no-op locally, and an upsert on the server.
 *
 * @returns whether a token is registered
 */
export const registerForPush = async (): Promise<boolean> => {
  const messaging = loadMessaging();
  if (!messaging) {
    status = 'unsupported';
    return false;
  }

  try {
    const instance = messaging.getMessaging();
    if (!(await ensurePermission(messaging, instance))) {
      status = 'denied';
      return false;
    }

    const token = await messaging.getToken(instance);
    await sendTokenToServer(token);
    status = 'registered';
    return true;
  } catch (error) {
    // No Google Play services, no network, permission race — push is a nice-to-have.
    status = 'failed';
    if (__DEV__) console.warn('[push] registration failed:', error);
    return false;
  }
};

/**
 * Drops this device's registration. Called on logout so the next person to sign in on
 * this phone does not receive the previous account's notifications.
 */
export const unregisterFromPush = async (): Promise<void> => {
  const token = registeredToken;
  registeredToken = null;
  status = 'unknown';
  if (!token) return;

  try {
    await notificationsApi.unregisterDevice(token);
  } catch {
    // Server-side cleanup also happens when FCM reports the token as dead.
  }

  try {
    const messaging = loadMessaging();
    if (messaging) await messaging.deleteToken(messaging.getMessaging());
  } catch {
    // Nothing to do — the server row is already gone.
  }
};

// `to` mirrors the in-app route stored on every notification ('/invoices/<id>').
const openFromRoute = (route?: string) => {
  if (!route || !navigationRef.isReady()) return;

  const invoiceMatch = /^\/invoices\/([^/?]+)/.exec(route);
  if (invoiceMatch) {
    navigationRef.navigate('MainTabs', { screen: 'InvoicesTab', params: { screen: 'InvoiceDetail', params: { id: invoiceMatch[1] } } });
    return;
  }

  if (route.startsWith('/products')) {
    navigationRef.navigate('MainTabs', { screen: 'CatalogTab', params: { screen: 'Products' } });
  }
};

/**
 * Wires token refresh and notification taps. Returns an unsubscribe function.
 * Call once, after sign-in.
 */
export const attachPushListeners = (): (() => void) => {
  const messaging = loadMessaging();
  if (!messaging) return () => {};

  try {
    const instance = messaging.getMessaging();

    // FCM rotates tokens; a stale one silently stops receiving.
    const offRefresh = messaging.onTokenRefresh(instance, (token) => {
      void sendTokenToServer(token).catch(() => {});
    });
    const offOpened = messaging.onNotificationOpenedApp(instance, (message) => openFromRoute(message?.data?.to));

    // Android never shows an FCM notification while the app is in the foreground, so without
    // this a push that arrives with the app open is invisible AND leaves the bell stale. The
    // in-app panel is the foreground surface: refresh it so the badge and list pick the
    // notification up immediately.
    const offForeground = messaging.onMessage(instance, () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    });

    // Cold start from a notification tap.
    void messaging
      .getInitialNotification(instance)
      .then((message) => openFromRoute(message?.data?.to))
      .catch(() => {});

    return () => {
      offRefresh();
      offOpened();
      offForeground();
    };
  } catch {
    return () => {};
  }
};
