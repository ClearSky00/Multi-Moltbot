import { createClient } from "@supabase/supabase-js";
import { createStorageAdapter, getSupabaseConfig } from "../services/auth";

let supabaseAuthClient = null;
let initializationPromise = null;

/**
 * Lazily initializes and returns the Supabase client for auth operations in the renderer.
 * Fetches the URL and keys securely via IPC, and configures the client with PKCE
 * and the custom IPC-based storage adapter.
 */
export async function getAuthClient() {
  if (supabaseAuthClient) return supabaseAuthClient;

  // Prevent multiple simultaneous initialization attempts
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      const res = await getSupabaseConfig();
      if (res.error || !res.data) {
        throw new Error(res.error || "Missing Supabase configuration");
      }

      const { url, anonKey } = res.data;

      supabaseAuthClient = createClient(url, anonKey, {
        auth: {
          flowType: "pkce",
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          storage: createStorageAdapter(),
        },
        global: {
          headers: {
            "x-application-name": "hivemind-os-auth",
          },
        },
      });

      return supabaseAuthClient;
    } catch (err) {
      initializationPromise = null;
      throw err;
    }
  })();

  return initializationPromise;
}

/**
 * Re-initialize the client (useful if settings change)
 */
export function resetAuthClient() {
  supabaseAuthClient = null;
  initializationPromise = null;
}
