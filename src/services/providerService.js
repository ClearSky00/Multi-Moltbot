/**
 * providerService.js — Renderer-side IPC wrappers for model provider management.
 *
 * All functions return the raw IPC result: { data: ... } or { error: string }.
 * Callers should check for result.error before using result.data.
 *
 * API keys NEVER appear in this file — key operations go to the main process
 * which handles all encryption/decryption via safeStorage.
 */

function invoke(channel, data) {
  return window.hivemind.invoke(channel, data);
}

/** List all configured providers with masked key status and default provider ID. */
export function listProviders() {
  return invoke("provider:list");
}

/** Create or update a provider's metadata (name, type, baseUrl, enabled, isDefault). */
export function upsertProvider(provider) {
  return invoke("provider:upsert", { provider });
}

/** Delete a provider and its associated API key. */
export function deleteProvider(id) {
  return invoke("provider:delete", { id });
}

/**
 * Save an API key for a provider (encrypted in main process via safeStorage).
 * Returns { data: { saved: true, masked: "..." } } — never the plaintext key.
 */
export function saveProviderKey(id, key) {
  return invoke("provider:save-key", { id, key });
}

/** Remove a stored API key for a provider. */
export function deleteProviderKey(id) {
  return invoke("provider:delete-key", { id });
}

/**
 * Test connectivity to a provider. Runs entirely in the main process.
 * Returns { data: { ok: bool, latencyMs: number, error?: string } }.
 * The API key is NEVER sent to the renderer.
 */
export function testProviderConnection(id) {
  return invoke("provider:test", { id });
}

/**
 * Fetch and cache available models for a provider.
 * Returns { data: { models: string[] } } with LiteLLM-format strings.
 */
export function fetchProviderModels(id) {
  return invoke("provider:models", { id });
}
