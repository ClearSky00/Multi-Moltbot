"use strict";

const { app } = require("electron");

const PROTOCOL = "hivemind-os";

// Only these keys are forwarded from deep-link URLs to the renderer.
// Everything else is silently dropped to prevent injection of arbitrary params.
const ALLOWED_DEEP_LINK_PARAMS = new Set([
  "access_token",
  "refresh_token",
  "expires_in",
  "expires_at",
  "token_type",
  "type",
  "error",
  "error_description",
  "code", // PKCE authorization code
]);

/**
 * Register the custom deep-link protocol.
 * Must be called BEFORE app.whenReady().
 */
function registerProtocol() {
  if (process.defaultApp) {
    // In development, register with the path to the electron binary
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
        require("path").resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

/**
 * Parse a deep-link URL and extract relevant auth parameters.
 * @param {string} url — e.g. 'hivemind-os://auth/callback#access_token=...&refresh_token=...'
 * @returns {{ path: string, params: Record<string, string> } | null}
 */
function parseDeepLink(url) {
  if (!url || !url.startsWith(`${PROTOCOL}://`)) {
    return null;
  }

  try {
    // Replace custom protocol with https for URL parsing
    const normalised = url.replace(
      `${PROTOCOL}://`,
      "https://hivemind-os.local/",
    );
    const parsed = new URL(normalised);

    // Extract fragment params (Supabase uses hash fragments for tokens)
    // Only known-good keys are forwarded — everything else is dropped.
    const params = {};
    const fragment = parsed.hash ? parsed.hash.substring(1) : "";
    if (fragment) {
      const fragmentParams = new URLSearchParams(fragment);
      for (const [key, value] of fragmentParams.entries()) {
        if (ALLOWED_DEEP_LINK_PARAMS.has(key)) {
          params[key] = value;
        }
      }
    }

    // Also extract query params (PKCE uses query params)
    for (const [key, value] of parsed.searchParams.entries()) {
      if (ALLOWED_DEEP_LINK_PARAMS.has(key)) {
        params[key] = value;
      }
    }

    return {
      path: parsed.pathname,
      params,
    };
  } catch {
    return null;
  }
}

/**
 * Handle an incoming deep link by forwarding it to the renderer.
 * @param {string} url — the full deep-link URL
 * @param {Electron.BrowserWindow} mainWindow
 */
function handleDeepLink(url, mainWindow) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const parsed = parseDeepLink(url);
  if (!parsed) return;

  // Bring window to front
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();

  // Send the full URL to the renderer for Supabase to process
  mainWindow.webContents.send("auth:handle-deep-link", {
    url,
    path: parsed.path,
    params: parsed.params,
  });
}

module.exports = {
  PROTOCOL,
  registerProtocol,
  parseDeepLink,
  handleDeepLink,
};
