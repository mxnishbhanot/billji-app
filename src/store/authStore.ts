import { create } from 'zustand';
import { AuthSession, User } from '@/types';
import { sessionStorage as SecureStore } from '@/store/sessionStorage';

const SESSION_KEY = 'billji-auth-session';

type AuthState = {
  token: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  sessionId: string | null;
  user: User | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (session: AuthSession) => Promise<void>;
  setUser: (user: User) => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  accessToken: null,
  refreshToken: null,
  sessionId: null,
  user: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw) as AuthSession;
        const accessToken = session.accessToken || session.token;
        set({ token: accessToken, accessToken, refreshToken: session.refreshToken || null, sessionId: session.sessionId || null, user: session.user });
      }
    } finally {
      set({ hydrated: true });
    }
  },
  setSession: async (session) => {
    const accessToken = session.accessToken || session.token;
    set({ token: accessToken, accessToken, refreshToken: session.refreshToken || null, sessionId: session.sessionId || null, user: session.user });
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({ ...session, token: accessToken, accessToken }));
  },
  setUser: async (user) => {
    const { accessToken, refreshToken, sessionId, token } = get();
    set({ user });
    if (token) await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({ token, accessToken: accessToken || token, refreshToken, sessionId, user }));
  },
  logout: async () => {
    set({ token: null, accessToken: null, refreshToken: null, sessionId: null, user: null });
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }
}));
