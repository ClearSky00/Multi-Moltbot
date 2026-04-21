"use strict";

const { getUserId } = require("../services/supabase");

/**
 * Returns the authenticated userId or an error object.
 * All IPC handlers that read/write user-scoped data MUST call this
 * and bail early if the user is not authenticated.
 *
 * @returns {{ error: string|null, userId: string|null }}
 */
function requireAuth() {
  const userId = getUserId();
  if (!userId) return { error: "Not authenticated", userId: null };
  return { error: null, userId };
}

module.exports = requireAuth;
