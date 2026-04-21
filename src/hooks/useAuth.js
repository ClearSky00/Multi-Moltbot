import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthClient } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import { syncSessionToMain, clearMainSession } from "../services/auth";

// =============================================================================
// Module-level auth listener — singleton that outlives component mount/unmount.
// Uses useAuthStore.getState() so store actions are always fresh.
// =============================================================================

let authInitStarted = false;

// Timeout for auth initialization — prevents hanging on unreachable Supabase
const AUTH_INIT_TIMEOUT_MS = 8000;

async function initAuthListener() {
  if (authInitStarted) return;
  authInitStarted = true;

  const store = () => useAuthStore.getState();

  // Safety timeout: if auth init takes too long, mark as initialized
  // with no session so the user sees the sign-in page instead of a spinner.
  const timeoutId = setTimeout(() => {
    if (!store().initialized) {
      console.warn("[Auth] Initialization timed out — showing sign-in page");
      store().setSession(null);
    }
  }, AUTH_INIT_TIMEOUT_MS);

  try {
    const supabase = await getAuthClient();

    // Register the auth state change listener — stays alive for the app's lifetime
    supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log(`[Auth] State changed: ${event}`);

      if (event === "SIGNED_OUT") {
        store().clearSession();
        clearMainSession().catch((err) =>
          console.error("[Auth] Failed to clear main session:", err),
        );
        return;
      }

      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "INITIAL_SESSION"
      ) {
        if (newSession?.access_token) {
          try {
            await syncSessionToMain(newSession.access_token);
            if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
              window.hivemind
                .invoke("app:init-workspaces")
                .catch((err) =>
                  console.warn("[Auth] Workspace init failed:", err),
                );
            }
          } catch (err) {
            console.error("[Auth] Failed to sync session to main:", err);
          }
        }
        store().setSession(newSession);
      }
    });

    // Explicitly fetch the initial session for reliability.
    // onAuthStateChange fires INITIAL_SESSION, but we double-check here
    // in case the listener missed it during setup.
    const {
      data: { session: initialSession },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("[Auth] Failed to restore session:", sessionError);
      store().setSession(null);
    } else if (initialSession?.access_token) {
      try {
        await syncSessionToMain(initialSession.access_token);
      } catch (err) {
        console.error("[Auth] Failed to sync restored session to main:", err);
      }
      store().setSession(initialSession);
    } else {
      // No session — mark as initialized but unauthenticated
      store().setSession(null);
    }
  } catch (err) {
    console.warn("[Auth] Initialization failed:", err.message);
    store().setSession(null);
  } finally {
    clearTimeout(timeoutId);
  }
}

// =============================================================================
// Module-level deep link handler — singleton, same pattern as auth listener.
// =============================================================================

let deepLinkRegistered = false;
// navigateRef is written by the hook so the deep link handler can route
let navigateRef = { current: null };

function initDeepLinkHandler() {
  if (deepLinkRegistered) return;
  deepLinkRegistered = true;

  const store = () => useAuthStore.getState();

  window.hivemind.on("auth:handle-deep-link", async (eventPayload) => {
    const { params } = eventPayload;
    const nav = navigateRef.current;

    try {
      const supabase = await getAuthClient();

      // PKCE flow: exchange authorization code for session tokens
      if (params.code) {
        console.log("[Auth] Exchanging PKCE code for session");
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(params.code);
        if (exchangeError) throw exchangeError;
        // onAuthStateChange fires SIGNED_IN → store updates → RequireAuth unblocks
        if (nav) nav("/", { replace: true });
        return;
      }

      // Recovery flow: password reset deep link
      if (params.type === "recovery") {
        if (params.access_token && params.refresh_token) {
          await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
        }
        if (nav) nav("/auth/reset-password", { replace: true });
        return;
      }

      // Email confirmation flow
      if (params.type === "email_confirmation" || params.type === "signup") {
        if (nav) nav("/auth/email-verified", { replace: true });
        return;
      }

      // Implicit flow fallback: tokens in URL fragment
      if (params.access_token && params.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (sessionError) throw sessionError;
        if (nav) nav("/", { replace: true });
        return;
      }

      // Error from OAuth provider
      if (params.error || params.error_description) {
        console.error(
          "[Auth] OAuth error:",
          params.error,
          params.error_description,
        );
        throw new Error(
          params.error_description || "Authentication was denied or failed.",
        );
      }

      // No tokens or code — check if we already have a session
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        if (nav) nav("/", { replace: true });
      } else {
        throw new Error("Invalid authentication link.");
      }
    } catch (err) {
      console.error("[Auth] Deep link handling failed:", err);
      store().setError(
        err.message || "Authentication failed. Please try again.",
      );
      if (nav) nav("/auth/signin", { replace: true });
    }
  });
}

// =============================================================================
// User-friendly error mapping (hides internal Supabase codes)
// =============================================================================

const mapAuthError = (err) => {
  if (!err) return "An unknown error occurred";
  const msg = err.message || "";
  if (msg.includes("Invalid login credentials"))
    return "Invalid email or password.";
  if (msg.includes("User already registered"))
    return "An account with this email already exists.";
  if (msg.includes("rate limit"))
    return "Too many attempts. Please try again later.";
  if (msg.includes("Password should be"))
    return "Password does not meet requirements.";
  if (msg.includes("not connected") || msg.includes("fetch"))
    return "Network error. Check your connection.";
  return "Authentication failed. Please try again.";
};

// =============================================================================
// useAuth hook — reads from store, provides action methods, kicks off singletons
// =============================================================================

export function useAuth() {
  const { session, user, initialized, loading, error } = useAuthStore();
  const setLoading = useAuthStore((s) => s.setLoading);
  const setError = useAuthStore((s) => s.setError);
  const clearSession = useAuthStore((s) => s.clearSession);

  const [rateLimit, setRateLimit] = useState({ attempts: 0, lockoutUntil: 0 });
  const navigate = useNavigate();

  // Keep navigateRef current for the deep link handler
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  // Kick off the module-level singletons on first mount (idempotent)
  useEffect(() => {
    initAuthListener();
    initDeepLinkHandler();
  }, []);

  // Rate Limiting
  const checkRateLimit = useCallback(() => {
    if (Date.now() < rateLimit.lockoutUntil) {
      const wait = Math.ceil((rateLimit.lockoutUntil - Date.now()) / 1000);
      throw new Error(`Too many attempts. Please wait ${wait} seconds.`);
    }
  }, [rateLimit]);

  const recordFailure = useCallback(() => {
    setRateLimit((prev) => {
      const attempts = prev.attempts + 1;
      const penaltySeconds = attempts >= 3 ? 12 : attempts >= 2 ? 6 : 3;
      return { attempts, lockoutUntil: Date.now() + penaltySeconds * 1000 };
    });
  }, []);

  // Auth Methods
  const signIn = useCallback(
    async (email, password) => {
      checkRateLimit();
      setLoading(true);
      setError(null);
      try {
        const supabase = await getAuthClient();
        const { data, error: sbError } = await supabase.auth.signInWithPassword(
          {
            email: email.trim(),
            password,
          },
        );
        if (sbError) throw sbError;
        setRateLimit({ attempts: 0, lockoutUntil: 0 });

        // Set session immediately so RequireAuth sees isAuthenticated: true
        // before navigation occurs. The onAuthStateChange listener will also
        // fire, but that is async and may run after navigate().
        if (data?.session) {
          useAuthStore.getState().setSession(data.session);
          syncSessionToMain(data.session.access_token).catch((err) =>
            console.error("[Auth] Failed to sync session after sign-in:", err),
          );
        }

        return { data, error: null };
      } catch (err) {
        recordFailure();
        const friendlyError = mapAuthError(err);
        setError(friendlyError);
        return { data: null, error: friendlyError };
      } finally {
        setLoading(false);
      }
    },
    [checkRateLimit, recordFailure, setLoading, setError],
  );

  const signUp = useCallback(
    async (email, password) => {
      checkRateLimit();
      setLoading(true);
      setError(null);
      try {
        const supabase = await getAuthClient();
        const { data, error: sbError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo:
              "hivemind-os://auth/callback?type=email_confirmation",
          },
        });
        if (sbError) throw sbError;

        // If email confirmation is disabled, session is returned immediately
        if (data?.session) {
          useAuthStore.getState().setSession(data.session);
          syncSessionToMain(data.session.access_token).catch((err) =>
            console.error("[Auth] Failed to sync session after sign-up:", err),
          );
        }

        return { data, error: null };
      } catch (err) {
        recordFailure();
        const friendlyError = mapAuthError(err);
        setError(friendlyError);
        return { data: null, error: friendlyError };
      } finally {
        setLoading(false);
      }
    },
    [checkRateLimit, recordFailure, setLoading, setError],
  );

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = await getAuthClient();
      await supabase.auth.signOut();
      clearSession();
      await clearMainSession();
    } catch (err) {
      console.error("[Auth] Sign out error:", err);
      clearSession();
      clearMainSession().catch(() => {});
    } finally {
      setLoading(false);
    }
  }, [setLoading, clearSession]);

  const signInWithOAuth = useCallback(
    async (provider) => {
      setLoading(true);
      setError(null);
      try {
        const supabase = await getAuthClient();

        // Generate the OAuth URL with PKCE. skipBrowserRedirect prevents the
        // Supabase client from navigating the current window — we open the URL
        // in a controlled in-app popup instead.
        const { data, error: sbError } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: "hivemind-os://auth/callback",
            skipBrowserRedirect: true,
          },
        });
        if (sbError) throw sbError;

        if (!data?.url) throw new Error("OAuth URL not returned by Supabase.");

        // Open the OAuth flow in an in-app BrowserWindow popup. The popup
        // intercepts the hivemind-os:// redirect and returns the parsed params
        // (including the PKCE authorization code) directly to us.
        const result = await window.hivemind.invoke("auth:open-oauth-popup", {
          url: data.url,
        });
        if (result?.error) throw new Error(result.error);

        // User closed the popup without completing auth
        if (result?.data?.cancelled) return { data: null, error: null };

        const { params } = result.data || {};

        // Surface any error the OAuth provider sent back
        if (params?.error) {
          throw new Error(params.error_description || params.error);
        }

        // Exchange the PKCE authorization code for a session
        if (params?.code) {
          const { data: sessionData, error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(params.code);
          if (exchangeError) throw exchangeError;

          // Set session immediately so navigation works right away
          if (sessionData?.session) {
            useAuthStore.getState().setSession(sessionData.session);
            syncSessionToMain(sessionData.session.access_token).catch((err) =>
              console.error(
                "[Auth] Failed to sync OAuth session to main:",
                err,
              ),
            );
          }

          return { data: sessionData, error: null };
        }

        return { data: null, error: null };
      } catch (err) {
        const friendlyError = mapAuthError(err);
        setError(friendlyError);
        return { data: null, error: friendlyError };
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError],
  );

  const resetPasswordForEmail = useCallback(
    async (email) => {
      checkRateLimit();
      setLoading(true);
      setError(null);
      try {
        const supabase = await getAuthClient();
        const { data, error: sbError } =
          await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: "hivemind-os://auth/callback?type=recovery",
          });
        if (sbError) throw sbError;
        return { data, error: null };
      } catch (err) {
        recordFailure();
        const friendlyError = mapAuthError(err);
        setError(friendlyError);
        return { data: null, error: friendlyError };
      } finally {
        setLoading(false);
      }
    },
    [checkRateLimit, recordFailure, setLoading, setError],
  );

  const updatePassword = useCallback(
    async (newPassword) => {
      setLoading(true);
      setError(null);
      try {
        const supabase = await getAuthClient();
        const { data, error: sbError } = await supabase.auth.updateUser({
          password: newPassword,
        });
        if (sbError) throw sbError;
        return { data, error: null };
      } catch (err) {
        const friendlyError = mapAuthError(err);
        setError(friendlyError);
        return { data: null, error: friendlyError };
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError],
  );

  const signInWithOtp = useCallback(
    async (email) => {
      checkRateLimit();
      setLoading(true);
      setError(null);
      try {
        const supabase = await getAuthClient();
        const { data, error: sbError } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: "hivemind-os://auth/callback",
          },
        });
        if (sbError) throw sbError;
        return { data, error: null };
      } catch (err) {
        recordFailure();
        const friendlyError = mapAuthError(err);
        setError(friendlyError);
        return { data: null, error: friendlyError };
      } finally {
        setLoading(false);
      }
    },
    [checkRateLimit, recordFailure, setLoading, setError],
  );

  return {
    session,
    user,
    isAuthenticated: !!session,
    initialized,
    loading,
    error,
    rateLimitLockout: Math.max(0, rateLimit.lockoutUntil - Date.now()),

    // Actions
    signIn,
    signUp,
    signOut,
    signInWithOAuth,
    signInWithOtp,
    resetPasswordForEmail,
    updatePassword,
    clearError: () => setError(null),
  };
}
