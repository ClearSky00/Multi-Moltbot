"use strict";

/**
 * providerHandlers.js — Model Provider configuration IPC handlers.
 *
 * SECURITY CONTRACT:
 *   - API keys are NEVER sent to the renderer process in plaintext.
 *   - Keys are decrypted only within handler scope for internal use.
 *   - All error messages are sanitized to strip potential key content.
 *   - Health checks and model fetches run entirely in the main process.
 *   - The renderer receives only: { exists: bool, masked: string } for key status.
 */

const { ipcMain, safeStorage } = require("electron");
const https = require("https");
const http = require("http");
const { URL } = require("url");

// electron-store v9 is ESM-only — lazy-init via dynamic import()
let providerStore = null;
let keyStore = null;

async function getProviderStore() {
  if (!providerStore) {
    const { default: Store } = await import("electron-store");
    providerStore = new Store({ name: "hivemind-providers", defaults: {} });
  }
  return providerStore;
}

async function getKeyStore() {
  if (!keyStore) {
    const { default: Store } = await import("electron-store");
    keyStore = new Store({ name: "hivemind-keys", defaults: {} });
  }
  return keyStore;
}

// ---------------------------------------------------------------------------
// Internal helpers (never exposed via IPC)
// ---------------------------------------------------------------------------

/**
 * Mask an API key for safe renderer display.
 * Returns first 4 + "..." + last 4 chars. Keys < 12 chars → "****".
 */
function maskApiKey(key) {
  if (!key || key.length < 12) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * Decrypt a provider API key from secure storage.
 * Returns null if not found or decryption fails.
 * INTERNAL USE ONLY — result must never be returned to the renderer.
 */
async function decryptProviderKey(providerId) {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const ks = await getKeyStore();
    const base64 = ks.get(`apiKeys.provider_${providerId}`);
    if (!base64) return null;
    return safeStorage.decryptString(Buffer.from(base64, "base64"));
  } catch {
    return null;
  }
}

/**
 * Strip any token-like strings from an error message before sending to renderer.
 * Prevents accidental key leakage via error messages.
 */
function sanitizeError(msg) {
  if (typeof msg !== "string") return "Unknown error";
  // Strip API key-like strings (20+ alphanumeric/dash/underscore chars)
  let sanitized = msg.replace(/[A-Za-z0-9_-]{20,}/g, "[REDACTED]");
  // Strip query params that might contain keys
  sanitized = sanitized.replace(/[?&]key=[^&\s]*/g, "?key=[REDACTED]");
  return sanitized;
}

/**
 * Make an HTTP(S) GET request from the main process.
 * Returns { statusCode, body } or throws on timeout/network error.
 */
function httpGet(urlString, headers = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(urlString);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${sanitizeError(e.message)}`));
    }

    const lib = parsedUrl.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: "GET",
        headers: { "User-Agent": "HiveMind-OS/1.0", ...headers },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("Request timed out"));
    });

    req.on("error", (err) => reject(new Error(sanitizeError(err.message))));
    req.end();
  });
}

/**
 * Test provider connectivity and validate the API key (if applicable).
 * Returns { ok, latencyMs, models?, error? }
 * Keys are decrypted here and NEVER returned to the caller or logged.
 */
async function testProviderConnection(provider) {
  const start = Date.now();

  try {
    switch (provider.type) {
      case "ollama":
      case "openai-compatible": {
        const baseUrl = (provider.baseUrl || "http://localhost:11434").replace(/\/$/, "");
        const { statusCode } = await httpGet(`${baseUrl}/`);
        if (statusCode >= 200 && statusCode < 400) {
          return { ok: true, latencyMs: Date.now() - start };
        }
        return { ok: false, latencyMs: Date.now() - start, error: `HTTP ${statusCode}` };
      }

      case "openai": {
        const key = await decryptProviderKey(provider.id);
        if (!key) return { ok: false, latencyMs: Date.now() - start, error: "No API key configured" };
        const base = (provider.baseUrl || "https://api.openai.com").replace(/\/$/, "");
        const { statusCode } = await httpGet(`${base}/v1/models`, {
          Authorization: `Bearer ${key}`,
        });
        if (statusCode === 200) return { ok: true, latencyMs: Date.now() - start };
        if (statusCode === 401) return { ok: false, latencyMs: Date.now() - start, error: "Invalid API key" };
        if (statusCode === 429) return { ok: true, latencyMs: Date.now() - start }; // rate limited but key valid
        return { ok: false, latencyMs: Date.now() - start, error: `HTTP ${statusCode}` };
      }

      case "gemini": {
        const key = await decryptProviderKey(provider.id);
        if (!key) return { ok: false, latencyMs: Date.now() - start, error: "No API key configured" };
        const { statusCode } = await httpGet(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1`,
        );
        if (statusCode === 200) return { ok: true, latencyMs: Date.now() - start };
        if (statusCode === 400 || statusCode === 403) return { ok: false, latencyMs: Date.now() - start, error: "Invalid API key" };
        return { ok: false, latencyMs: Date.now() - start, error: `HTTP ${statusCode}` };
      }

      case "anthropic": {
        const key = await decryptProviderKey(provider.id);
        if (!key) return { ok: false, latencyMs: Date.now() - start, error: "No API key configured" };
        const { statusCode } = await httpGet("https://api.anthropic.com/v1/models", {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        });
        if (statusCode === 200) return { ok: true, latencyMs: Date.now() - start };
        if (statusCode === 401) return { ok: false, latencyMs: Date.now() - start, error: "Invalid API key" };
        return { ok: false, latencyMs: Date.now() - start, error: `HTTP ${statusCode}` };
      }

      default:
        return { ok: false, latencyMs: Date.now() - start, error: `Unknown provider type: ${provider.type}` };
    }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: sanitizeError(err.message) };
  }
}

/**
 * Fetch the list of available models for a provider.
 * Returns an array of LiteLLM-format model strings (e.g., "ollama/gemma4:e4b").
 * Keys are decrypted here and NEVER returned to the caller.
 */
async function fetchProviderModels(provider) {
  try {
    switch (provider.type) {
      case "ollama": {
        const baseUrl = (provider.baseUrl || "http://localhost:11434").replace(/\/$/, "");
        const { statusCode, body } = await httpGet(`${baseUrl}/api/tags`);
        if (statusCode !== 200) throw new Error(`HTTP ${statusCode}`);
        const json = JSON.parse(body);
        return (json.models || []).map((m) => `ollama/${m.name}`);
      }

      case "openai-compatible": {
        const baseUrl = (provider.baseUrl || "http://localhost:11434").replace(/\/$/, "");
        const key = await decryptProviderKey(provider.id);
        const headers = key ? { Authorization: `Bearer ${key}` } : {};
        const { statusCode, body } = await httpGet(`${baseUrl}/v1/models`, headers);
        if (statusCode !== 200) throw new Error(`HTTP ${statusCode}`);
        const json = JSON.parse(body);
        const prefix = provider.modelPrefix || "openai";
        return (json.data || []).map((m) => `${prefix}/${m.id}`);
      }

      case "openai": {
        const key = await decryptProviderKey(provider.id);
        if (!key) throw new Error("No API key configured");
        const base = (provider.baseUrl || "https://api.openai.com").replace(/\/$/, "");
        const { statusCode, body } = await httpGet(`${base}/v1/models`, {
          Authorization: `Bearer ${key}`,
        });
        if (statusCode !== 200) throw new Error(`HTTP ${statusCode}`);
        const json = JSON.parse(body);
        return (json.data || [])
          .map((m) => `openai/${m.id}`)
          .filter((m) => m.includes("gpt") || m.includes("o1") || m.includes("o3"))
          .sort();
      }

      case "gemini": {
        const key = await decryptProviderKey(provider.id);
        if (!key) throw new Error("No API key configured");
        const { statusCode, body } = await httpGet(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=50`,
        );
        if (statusCode !== 200) throw new Error(`HTTP ${statusCode}`);
        const json = JSON.parse(body);
        return (json.models || [])
          .map((m) => `gemini/${m.name.replace("models/", "")}`)
          .filter((m) => m.includes("gemini"));
      }

      case "anthropic": {
        const key = await decryptProviderKey(provider.id);
        if (!key) throw new Error("No API key configured");
        const { statusCode, body } = await httpGet("https://api.anthropic.com/v1/models", {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        });
        if (statusCode !== 200) throw new Error(`HTTP ${statusCode}`);
        const json = JSON.parse(body);
        return (json.data || []).map((m) => `anthropic/${m.id}`);
      }

      default:
        return [];
    }
  } catch (err) {
    throw new Error(sanitizeError(err.message));
  }
}

// ---------------------------------------------------------------------------
// Migration: move legacy apiKeys.gemini → provider_gemini-default
// ---------------------------------------------------------------------------
async function runMigrationIfNeeded() {
  try {
    const ps = await getProviderStore();
    if (ps.get("migrated")) return;

    const providers = ps.get("providers") || {};
    if (Object.keys(providers).length > 0) {
      ps.set("migrated", true);
      return;
    }

    // Check for existing gemini key
    const ks = await getKeyStore();
    const legacyKey = ks.get("apiKeys.gemini");

    const defaultId = "gemini-default";
    const now = new Date().toISOString();

    if (legacyKey) {
      // Copy encrypted blob to new namespace (no decryption needed)
      ks.set(`apiKeys.provider_${defaultId}`, legacyKey);
    }

    // Create default Gemini provider
    providers[defaultId] = {
      id: defaultId,
      type: "gemini",
      name: "Gemini",
      baseUrl: "",
      enabled: true,
      isDefault: true,
      models: [],
      createdAt: now,
      updatedAt: now,
    };

    ps.set("providers", providers);
    ps.set("defaultProviderId", defaultId);
    ps.set("migrated", true);
  } catch (err) {
    // Non-fatal — migration failure shouldn't crash the app
    console.error("[providerHandlers] Migration failed:", err.message);
  }
}

// ---------------------------------------------------------------------------
// IPC handler registration
// ---------------------------------------------------------------------------
module.exports = function registerProviderHandlers(_mainWindow) {
  // Run migration once on startup
  runMigrationIfNeeded();

  // -------------------------------------------------------------------------
  // provider:list — List all providers with masked key status
  // -------------------------------------------------------------------------
  ipcMain.handle("provider:list", async () => {
    try {
      const ps = await getProviderStore();
      const ks = await getKeyStore();
      const rawProviders = ps.get("providers") || {};
      const defaultId = ps.get("defaultProviderId") || null;

      const providers = await Promise.all(
        Object.values(rawProviders).map(async (p) => {
          const base64 = ks.get(`apiKeys.provider_${p.id}`);
          let keyStatus = { exists: false, masked: null };
          if (base64 && safeStorage.isEncryptionAvailable()) {
            try {
              const dec = safeStorage.decryptString(Buffer.from(base64, "base64"));
              keyStatus = { exists: true, masked: maskApiKey(dec) };
            } catch {
              keyStatus = { exists: false, masked: null };
            }
          }
          return { ...p, keyStatus };
        }),
      );

      return { data: { providers, defaultId } };
    } catch (err) {
      return { error: sanitizeError(err.message) };
    }
  });

  // -------------------------------------------------------------------------
  // provider:upsert — Create or update a provider's metadata
  // -------------------------------------------------------------------------
  ipcMain.handle("provider:upsert", async (_event, { provider }) => {
    if (!provider) return { error: "provider is required" };
    if (!provider.type) return { error: "provider.type is required" };
    if (!provider.name) return { error: "provider.name is required" };

    try {
      const ps = await getProviderStore();
      const providers = ps.get("providers") || {};
      const now = new Date().toISOString();

      const id = provider.id || `${provider.type}-${Date.now()}`;
      const existing = providers[id] || {};

      const updated = {
        ...existing,
        ...provider,
        id,
        updatedAt: now,
        createdAt: existing.createdAt || now,
        models: provider.models ?? existing.models ?? [],
      };

      providers[id] = updated;
      ps.set("providers", providers);

      // Set as default if: first provider ever, or explicitly requested
      if (!ps.get("defaultProviderId") || updated.isDefault) {
        ps.set("defaultProviderId", id);
      }

      return { data: { provider: updated } };
    } catch (err) {
      return { error: sanitizeError(err.message) };
    }
  });

  // -------------------------------------------------------------------------
  // provider:delete — Remove a provider and its API key
  // -------------------------------------------------------------------------
  ipcMain.handle("provider:delete", async (_event, { id }) => {
    if (!id) return { error: "id is required" };

    try {
      const ps = await getProviderStore();
      const ks = await getKeyStore();
      const providers = ps.get("providers") || {};

      if (!providers[id]) return { error: `Provider "${id}" not found` };

      delete providers[id];
      ps.set("providers", providers);

      // Delete associated key
      ks.delete(`apiKeys.provider_${id}`);

      // Clear default if it was this provider
      if (ps.get("defaultProviderId") === id) {
        const remaining = Object.keys(providers);
        ps.set("defaultProviderId", remaining[0] || null);
      }

      return { data: { deleted: true, id } };
    } catch (err) {
      return { error: sanitizeError(err.message) };
    }
  });

  // -------------------------------------------------------------------------
  // provider:save-key — Encrypt and store an API key for a provider
  // -------------------------------------------------------------------------
  ipcMain.handle("provider:save-key", async (_event, { id, key }) => {
    if (!id) return { error: "id is required" };
    if (!key) return { error: "key is required" };

    if (!safeStorage.isEncryptionAvailable()) {
      return { error: "OS encryption is not available on this system" };
    }

    try {
      const ks = await getKeyStore();
      const encrypted = safeStorage.encryptString(key);
      ks.set(`apiKeys.provider_${id}`, encrypted.toString("base64"));
      return { data: { saved: true, masked: maskApiKey(key) } };
    } catch (err) {
      return { error: sanitizeError(err.message) };
    }
  });

  // -------------------------------------------------------------------------
  // provider:delete-key — Remove a stored API key
  // -------------------------------------------------------------------------
  ipcMain.handle("provider:delete-key", async (_event, { id }) => {
    if (!id) return { error: "id is required" };

    try {
      const ks = await getKeyStore();
      ks.delete(`apiKeys.provider_${id}`);
      return { data: { deleted: true } };
    } catch (err) {
      return { error: sanitizeError(err.message) };
    }
  });

  // -------------------------------------------------------------------------
  // provider:test — Test connectivity (main process only, key never returned)
  // -------------------------------------------------------------------------
  ipcMain.handle("provider:test", async (_event, { id }) => {
    if (!id) return { error: "id is required" };

    try {
      const ps = await getProviderStore();
      const providers = ps.get("providers") || {};
      const provider = providers[id];
      if (!provider) return { error: `Provider "${id}" not found` };

      const result = await testProviderConnection(provider);
      return { data: result };
    } catch (err) {
      return { error: sanitizeError(err.message) };
    }
  });

  // -------------------------------------------------------------------------
  // provider:models — Fetch and cache available models
  // -------------------------------------------------------------------------
  ipcMain.handle("provider:models", async (_event, { id }) => {
    if (!id) return { error: "id is required" };

    try {
      const ps = await getProviderStore();
      const providers = ps.get("providers") || {};
      const provider = providers[id];
      if (!provider) return { error: `Provider "${id}" not found` };

      const models = await fetchProviderModels(provider);

      // Cache the model list on the provider record
      const now = new Date().toISOString();
      providers[id] = { ...provider, models, modelsLastFetched: now };
      ps.set("providers", providers);

      return { data: { models } };
    } catch (err) {
      return { error: sanitizeError(err.message) };
    }
  });
};

// Export internal decrypt helper for other main-process modules (e.g., providerCredentials.js)
module.exports.decryptProviderKey = decryptProviderKey;
module.exports.getProviderStore = getProviderStore;
