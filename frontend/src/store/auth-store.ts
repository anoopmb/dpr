import { create } from 'zustand';

export type UserRole = 'SITE_ENGINEER' | 'PROJECT_MANAGER' | 'QUANTITY_SURVEYOR' | 'STORE_KEEPER' | 'ADMIN';

export interface AuthUser {
  id: string;
  loginId: string;
  fullName: string;
  email: string;
  photoUrl: string | null;
  role: UserRole;
}

interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser) => void;
  clearUser: () => void;
}

// No token is stored here — the session lives entirely in the httpOnly
// access_token/refresh_token cookies, which JS cannot read. This store only
// caches the profile fetched from GET /auth/me for UI display.
export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
}));

export const isFieldRole = (role: UserRole | undefined) => role === 'SITE_ENGINEER';
