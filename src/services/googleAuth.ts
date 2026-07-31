import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes
} from '@react-native-google-signin/google-signin';

// Web client ID from the Firebase Console (Authentication → Sign-in method →
// Google → Web SDK configuration). Becomes the "aud" of the ID token Google
// mints, so the backend must list this same value in GOOGLE_OAUTH_CLIENT_IDS.
// Injected at build time via EAS.
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

let configured = false;

const ensureConfigured = () => {
  if (configured) return;
  GoogleSignin.configure({
    webClientId,
    offlineAccess: false
  });
  configured = true;
};

export const isGoogleSignInConfigured = () => Boolean(webClientId);

export class GoogleSignInCancelled extends Error {
  constructor() {
    super('Google sign-in cancelled');
    this.name = 'GoogleSignInCancelled';
  }
}

// Run the native Google flow and return the ID token to hand to our backend.
// Throws GoogleSignInCancelled if the user dismisses the picker.
export const signInWithGoogle = async (): Promise<string> => {
  if (!isGoogleSignInConfigured()) {
    throw new Error('Google sign-in is not configured. Missing web client ID.');
  }
  ensureConfigured();

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();

    if (response.type === 'cancelled') throw new GoogleSignInCancelled();

    const idToken = response.data?.idToken;
    if (!idToken) throw new Error('Google did not return an ID token');

    return idToken;
  } catch (error) {
    if (error instanceof GoogleSignInCancelled) throw error;
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new GoogleSignInCancelled();
    }
    throw error;
  }
};

export const signOutGoogle = async () => {
  try {
    await GoogleSignin.signOut();
  } catch {
    // best-effort — backend session is the source of truth
  }
};
