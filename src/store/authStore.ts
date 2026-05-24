import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { AuthSession, User } from '@/types';

const SESSION_KEY = 'billji-auth-session';

type AuthState = {
  token: string | null;
  user: User | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (session: AuthSession) => Promise<void>;
  setUser: (user: User) => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw) as AuthSession;
        set({ token: session.token, user: session.user });
      }
    } finally {
      set({ hydrated: true });
    }
  },
  setSession: async ({ token, user }) => {
    set({ token, user });
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({ token, user }));
  },
  setUser: async (user) => {
    const token = get().token;
    set({ user });
    if (token) await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({ token, user }));
  },
  logout: async () => {
    set({ token: null, user: null });
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }
}));
