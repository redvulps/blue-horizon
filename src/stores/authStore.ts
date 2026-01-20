import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { SessionInfo, resumeSession, logout } from "@/lib/auth";

interface AuthState {
  isAuthenticated: boolean;
  isCheckingSession: boolean;
  session: SessionInfo | null;
  error: string | null;

  setSession: (session: SessionInfo | null) => void;
  checkSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  immer((set) => ({
    isAuthenticated: false,
    isCheckingSession: true,
    session: null,
    error: null,

    setSession: (session) =>
      set((state) => {
        state.session = session;
        state.isAuthenticated = !!session;
        state.error = null;
      }),

    checkSession: async () => {
      set((state) => {
        state.isCheckingSession = true;
        state.error = null;
      });

      try {
        const session = await resumeSession();
        set((state) => {
          state.session = session;
          state.isAuthenticated = true;
          state.isCheckingSession = false;
        });
      } catch (err: unknown) {
        console.error("Failed to resume session:", err);
        set((state) => {
          state.session = null;
          state.isAuthenticated = false;
          state.isCheckingSession = false;
        });
      }
    },

    signOut: async () => {
      try {
        await logout();
      } catch (err) {
        console.error("Logout failed:", err);
      } finally {
        set((state) => {
          state.session = null;
          state.isAuthenticated = false;
        });
      }
    },
  })),
);

// Atomic selectors
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated;
export const selectSession = (state: AuthState) => state.session;
export const selectIsCheckingSession = (state: AuthState) => state.isCheckingSession;
export const selectAuthError = (state: AuthState) => state.error;
