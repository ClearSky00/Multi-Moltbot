import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export const useAuthStore = create(
  subscribeWithSelector((set, get) => ({
    // Auth State
    session: null,
    user: null,

    // UI State
    initialized: false,
    loading: true,
    error: null,

    // Actions
    setSession: (session) => {
      set({
        session,
        user: session?.user || null,
        initialized: true,
        loading: false,
        error: null,
      });
    },

    setLoading: (loading) => set({ loading }),

    setError: (error) => set({ error, loading: false }),

    // Sign-out clear: keeps initialized: true to avoid re-init flicker
    clearSession: () =>
      set({
        session: null,
        user: null,
        initialized: true,
        error: null,
        loading: false,
      }),

    // Full reset (e.g. reconfigure Supabase): re-triggers init
    clear: () =>
      set({
        session: null,
        user: null,
        initialized: false,
        error: null,
        loading: false,
      }),
  })),
);

// Derived selectors
export const selectIsAuthenticated = (state) => !!state.session;
export const selectUser = (state) => state.user;
export const selectAuthLoading = (state) => state.loading;
export const selectAuthError = (state) => state.error;
export const selectAuthInitialized = (state) => state.initialized;
