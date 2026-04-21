/**
 * Auth Service — wraps ALL auth:* IPC calls.
 * This is the ONLY place in the renderer that touches window.hivemind for auth.
 */

function invoke(channel, data) {
  return window.hivemind.invoke(channel, data);
}

// ============================================================================
// SYSTEM STORAGE ADAPTER (for Supabase Client)
// ============================================================================

/**
 * Creates an async storage adapter that routes getItem/setItem/removeItem
 * through IPC to the main process for secure encrypted storage.
 */
export function createStorageAdapter() {
  return {
    getItem: async (key) => {
      const result = await invoke("auth:storage:get", { key });
      if (result.error) {
        console.error("[Auth Storage Error]", result.error);
        return null;
      }
      return result.data;
    },
    setItem: async (key, value) => {
      const result = await invoke("auth:storage:set", { key, value });
      if (result.error) {
        console.error("[Auth Storage Error]", result.error);
      }
    },
    removeItem: async (key) => {
      const result = await invoke("auth:storage:remove", { key });
      if (result.error) {
        console.error("[Auth Storage Error]", result.error);
      }
    },
  };
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

export function getPersistedSession() {
  return invoke("auth:get-session");
}

export function savePersistedSession(session) {
  return invoke("auth:save-session", { session });
}

export function clearPersistedSession() {
  return invoke("auth:clear-session");
}

// ============================================================================
// SESSION SYNC — bridge auth to main-process Supabase client
// ============================================================================

/**
 * Sync the renderer's auth session to the main process so the main-process
 * Supabase client can make authenticated DB requests (required for RLS).
 * Must be called on every SIGNED_IN and TOKEN_REFRESHED event.
 * The main process extracts userId from the JWT — never trust the renderer.
 */
export function syncSessionToMain(accessToken) {
  return invoke("auth:sync-session", { accessToken });
}

/**
 * Clear the main-process session (sign out).
 */
export function clearMainSession() {
  return invoke("auth:clear-main-session");
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Get Supabase URL and Anon Key from the main process securely.
 */
export function getSupabaseConfig() {
  return invoke("auth:get-supabase-config");
}

/**
 * Close the in-app OAuth BrowserWindow (user dismissed from the auth screen).
 */
export function cancelOAuthPopup() {
  return invoke("auth:cancel-oauth-popup");
}
