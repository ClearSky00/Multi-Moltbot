"use strict";

const { safeStorage } = require("electron");

// electron-store v9 is ESM-only — lazy-init via dynamic import()
let tokenStore = null;

async function getTokenStore() {
  if (!tokenStore) {
    const { default: Store } = await import("electron-store");
    tokenStore = new Store({
      name: "hivemind-auth-tokens",
      defaults: {},
    });
  }
  return tokenStore;
}

/**
 * Save a value encrypted with OS-level safeStorage.
 * @param {string} key — storage key (e.g. 'sb-access-token')
 * @param {string} value — plaintext value to encrypt
 */
async function setItem(key, value) {
  if (!key || typeof value !== "string") {
    throw new Error("key and string value are required");
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS encryption is not available");
  }
  const store = await getTokenStore();
  const encrypted = safeStorage.encryptString(value);
  store.set(key, encrypted.toString("base64"));
}

/**
 * Retrieve and decrypt a value from secure storage.
 * @param {string} key — storage key
 * @returns {string|null} — decrypted value or null if not found
 */
async function getItem(key) {
  if (!key) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;

  const store = await getTokenStore();
  const base64 = store.get(key);
  if (!base64) return null;

  try {
    return safeStorage.decryptString(Buffer.from(base64, "base64"));
  } catch {
    // Corrupted data — remove it
    store.delete(key);
    return null;
  }
}

/**
 * Remove a key from secure storage.
 * @param {string} key — storage key
 */
async function removeItem(key) {
  if (!key) return;
  const store = await getTokenStore();
  store.delete(key);
}

/**
 * Save a complete auth session (access + refresh tokens).
 * @param {{ access_token: string, refresh_token: string, expires_at?: number }} session
 */
async function saveSession(session) {
  if (!session) throw new Error("session is required");
  // Store the full session JSON blob encrypted
  await setItem("hivemind-auth-session", JSON.stringify(session));
}

/**
 * Load the persisted auth session.
 * @returns {object|null} — parsed session or null
 */
async function loadSession() {
  const raw = await getItem("hivemind-auth-session");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    await removeItem("hivemind-auth-session");
    return null;
  }
}

/**
 * Clear the auth session. Only removes the session key — does NOT
 * nuke the entire store, which may contain PKCE code verifiers or
 * other Supabase storage adapter keys still in use.
 */
async function clearSession() {
  await removeItem("hivemind-auth-session");
}

module.exports = {
  setItem,
  getItem,
  removeItem,
  saveSession,
  loadSession,
  clearSession,
};
