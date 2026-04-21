"use strict";

/**
 * Detect the model family from a model string.
 * Used to adjust behavior for different model providers.
 *
 * @param {string} model  Model identifier (e.g. "ollama/gemma4:e4b", "gemini/gemini-2.0-flash")
 * @returns {{ provider: string, isLocal: boolean, supportsToolCalling: boolean }}
 */
function detectModelFamily(model) {
  if (!model || typeof model !== "string") {
    return { provider: "unknown", isLocal: false, supportsToolCalling: false };
  }

  const lower = model.toLowerCase();

  if (lower.startsWith("ollama/") || lower.startsWith("ollama_chat/")) {
    return { provider: "ollama", isLocal: true, supportsToolCalling: false };
  }
  if (lower.startsWith("gemini/") || lower.startsWith("google/")) {
    return { provider: "gemini", isLocal: false, supportsToolCalling: true };
  }
  if (lower.startsWith("openai/") || lower.startsWith("gpt-")) {
    return { provider: "openai", isLocal: false, supportsToolCalling: true };
  }
  if (lower.startsWith("anthropic/") || lower.startsWith("claude-")) {
    return { provider: "anthropic", isLocal: false, supportsToolCalling: true };
  }

  // No provider prefix — likely a local/custom model
  if (!lower.includes("/")) {
    return { provider: "local", isLocal: true, supportsToolCalling: false };
  }

  return { provider: "unknown", isLocal: false, supportsToolCalling: false };
}

module.exports = { detectModelFamily };
