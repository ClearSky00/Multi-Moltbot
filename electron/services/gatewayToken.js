"use strict";

const { safeStorage } = require("electron");

/**
 * Resolve the OpenClaw gateway auth token for WebSocket connect frames.
 * Order: OPENCLAW_GATEWAY_TOKEN env, then Settings → Gateway Token (hivemind-keys).
 */
async function loadGatewayToken() {
  const env = (process.env.OPENCLAW_GATEWAY_TOKEN || "").trim();
  if (env) return env;

  if (!safeStorage.isEncryptionAvailable()) {
    return "";
  }

  try {
    const { default: Store } = await import("electron-store");
    const ks = new Store({ name: "hivemind-keys", defaults: {} });
    const base64 = ks.get("apiKeys.gateway_token");
    if (!base64 || typeof base64 !== "string") return "";

    return safeStorage.decryptString(Buffer.from(base64, "base64"));
  } catch (err) {
    console.warn(
      "[gatewayToken] Failed to load stored gateway token:",
      err.message,
    );
    return "";
  }
}

module.exports = { loadGatewayToken };
