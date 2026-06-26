import { Platform } from 'react-native';
import { sessionStorage } from '@/store/sessionStorage';

// Single analytics facade. Call sites import ONLY from here — never from
// @react-native-firebase or @sentry directly — so the SDK behind it is swappable
// and every call is guarded against the native module being absent.
//
// PRIVACY: never pass PII (names, phone, email, address, amounts, GST/PAN, notes)
// into track()/setAnalyticsUser(). Params are restricted to counts/enums/booleans.
// The user id we set is the opaque Mongo ObjectId only.

// Allowed event names. Firebase caps event names at 40 chars / params at 25.
export type AnalyticsEvent = 'invoice_created' | 'invoice_shared';
type AnalyticsParams = Record<string, string | number | boolean>;

const CONSENT_KEY = 'billji-analytics-consent';
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
// Master kill switch per EAS profile. Set 'true' ONLY in the production profile so
// development/preview builds never pollute Firebase/Sentry with test data. When not
// 'true', initAnalytics() returns early → modules stay unloaded → track/recordError no-op.
const ANALYTICS_ENABLED = process.env.EXPO_PUBLIC_ANALYTICS_ENABLED === 'true';

// Analytics must never crash or block the app, and the native modules are absent
// until a dev/prod build includes them (Expo Go / web have neither). Everything is
// lazily required inside try/catch and held as `any`.
let firebaseAnalytics: (() => any) | null = null;
let Sentry: any = null;
let initialized = false;
// Opt-in ON by default; user can disable in Settings. We flip this to the stored
// value during initAnalytics().
let consentEnabled = true;

// Web has no native modules; on Expo Go the lazy require below simply fails and
// every method no-ops. So a Platform check is enough here.
const isSupportedRuntime = () => Platform.OS !== 'web';

function loadModules() {
  if (firebaseAnalytics || Sentry) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    firebaseAnalytics = require('@react-native-firebase/analytics').default;
  } catch {
    firebaseAnalytics = null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Sentry = require('@sentry/react-native');
  } catch {
    Sentry = null;
  }
}

// Strip an App component through Sentry's error-boundary wrapper. No-op when the
// SDK isn't present so App.tsx can always call it unconditionally.
export function wrapApp<T>(App: T): T {
  if (!ANALYTICS_ENABLED) return App;
  loadModules();
  try {
    return Sentry && typeof Sentry.wrap === 'function' ? Sentry.wrap(App) : App;
  } catch {
    return App;
  }
}

export async function initAnalytics(): Promise<void> {
  if (initialized || !ANALYTICS_ENABLED || !isSupportedRuntime()) return;
  initialized = true;
  loadModules();

  try {
    const stored = await sessionStorage.getItemAsync(CONSENT_KEY);
    consentEnabled = stored === null ? true : stored === 'true';
  } catch {
    consentEnabled = true;
  }

  try {
    if (Sentry && SENTRY_DSN) {
      Sentry.init({
        dsn: SENTRY_DSN,
        enabled: consentEnabled,
        // Don't ship raw request/response bodies — they can carry customer data.
        sendDefaultPii: false,
        beforeSend: (event: any) => {
          if (event?.request) delete event.request.data;
          return event;
        }
      });
    }
  } catch {
    // ignore — crash reporting is best-effort
  }

  try {
    if (firebaseAnalytics) {
      await firebaseAnalytics().setAnalyticsCollectionEnabled(consentEnabled);
    }
  } catch {
    // ignore
  }
}

export function track(event: AnalyticsEvent, params?: AnalyticsParams): void {
  if (!consentEnabled || !firebaseAnalytics) return;
  try {
    // Firebase params accept string/number only — coerce booleans to 1/0.
    const safe: Record<string, string | number> = {};
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        safe[key] = typeof value === 'boolean' ? (value ? 1 : 0) : value;
      }
    }
    void firebaseAnalytics().logEvent(event, safe);
  } catch {
    // ignore — analytics is fire-and-forget
  }
}

export function setAnalyticsUser(user: { id: string; businessId?: string | null } | null): void {
  try {
    if (firebaseAnalytics) void firebaseAnalytics().setUserId(user ? user.id : null);
    if (Sentry) Sentry.setUser(user ? { id: user.id } : null);
  } catch {
    // ignore
  }
}

export async function getAnalyticsConsent(): Promise<boolean> {
  try {
    const stored = await sessionStorage.getItemAsync(CONSENT_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

export async function setAnalyticsConsent(enabled: boolean): Promise<void> {
  consentEnabled = enabled;
  try {
    await sessionStorage.setItemAsync(CONSENT_KEY, String(enabled));
  } catch {
    // ignore persistence failure — in-memory flag still applies this session
  }
  try {
    if (firebaseAnalytics) await firebaseAnalytics().setAnalyticsCollectionEnabled(enabled);
    if (Sentry?.getClient?.()) Sentry.getClient().getOptions().enabled = enabled;
  } catch {
    // ignore
  }
}

export function recordError(error: unknown, context?: Record<string, string>): void {
  if (!consentEnabled || !Sentry) return;
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // ignore
  }
}
