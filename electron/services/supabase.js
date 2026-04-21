"use strict";

const { createClient } = require("@supabase/supabase-js");

let supabaseInstance = null;
let currentUserId = null;

/**
 * Build the standard client options. When an accessToken is provided the
 * client authenticates every request with it (required for RLS).
 */
function buildClientOptions(accessToken) {
  const headers = { "x-application-name": "hivemind-os" };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  return {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { headers },
  };
}

/**
 * Returns the singleton Supabase client.
 * Lazily initializes on first call using environment variables.
 * Returns null if SUPABASE_URL or SUPABASE_ANON_KEY are not configured,
 * indicating the user hasn't completed onboarding yet.
 */
function getSupabase() {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  supabaseInstance = createClient(url, anonKey, buildClientOptions());
  return supabaseInstance;
}

/**
 * Returns the current authenticated user's ID, or null.
 */
function getUserId() {
  return currentUserId;
}

/**
 * Decode the `sub` claim from a JWT without verifying the signature.
 * Signature verification is left to Supabase on each DB request.
 * We also reject obviously expired tokens.
 */
function decodeJwtClaims(jwt) {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");

  const payload = JSON.parse(
    Buffer.from(parts[1], "base64url").toString("utf8"),
  );

  if (!payload.sub) throw new Error("JWT missing sub claim");

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("JWT is expired");
  }

  return payload;
}

/**
 * Set the user's auth session on the main-process Supabase client.
 * Called when the renderer authenticates or refreshes its token.
 * Recreates the client with the user's JWT in the Authorization header
 * so all subsequent DB requests pass RLS checks.
 *
 * userId is extracted from the JWT `sub` claim — never trusted from the renderer.
 *
 * @param {string} accessToken — JWT access token from Supabase Auth
 */
function setUserSession(accessToken) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase not configured — cannot set user session");
  }

  const claims = decodeJwtClaims(accessToken);
  currentUserId = claims.sub;
  supabaseInstance = createClient(
    url,
    anonKey,
    buildClientOptions(accessToken),
  );
}

/**
 * Clear the user session (sign out). Recreates an anonymous client.
 */
function clearUserSession() {
  currentUserId = null;

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (url && anonKey) {
    supabaseInstance = createClient(url, anonKey, buildClientOptions());
  } else {
    supabaseInstance = null;
  }
}

/**
 * Reconfigure the Supabase client with new credentials.
 * Called during the onboarding flow when the user provides
 * their Supabase URL and anon key for the first time,
 * or when updating credentials in settings.
 */
function reconfigure(url, anonKey) {
  if (!url || !anonKey) {
    throw new Error(
      "Both url and anonKey are required to reconfigure Supabase",
    );
  }

  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_ANON_KEY = anonKey;

  supabaseInstance = createClient(url, anonKey, buildClientOptions());
  currentUserId = null;

  return supabaseInstance;
}

// =============================================================================
// Schema-resilient helpers
//
// Migration 0007 adds user_id to all data tables. If migrations haven't been
// applied, inserts that include user_id will fail with a PostgREST schema cache
// error. These helpers detect that and retry without user_id so the app remains
// functional pre-migration. A single console warning nudges the dev to migrate.
// =============================================================================

let _schemaHasUserId = true;
let _warnedOnce = false;

function _isUserIdSchemaError(err) {
  const msg = err?.message || "";
  return msg.includes("user_id") && msg.includes("schema cache");
}

function _warnMigration() {
  if (!_warnedOnce) {
    _warnedOnce = true;
    console.warn(
      "[Supabase] user_id column missing from one or more tables. " +
        "Run migrations to fix: npx supabase db push",
    );
  }
}

/**
 * Remove `user_id` from a record if the schema doesn't support it.
 * @param {object} record
 * @returns {object}
 */
function stripUserId(record) {
  if (_schemaHasUserId || !("user_id" in record)) return record;
  const { user_id, ...rest } = record;
  return rest;
}

/**
 * Insert a record into a table, falling back to omitting user_id if the
 * column doesn't exist in the schema.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} table
 * @param {object} record
 * @returns {Promise<{data: any, error: any}>}
 */
async function safeInsert(supabase, table, record) {
  const cleaned = stripUserId(record);
  const result = await supabase
    .from(table)
    .insert(cleaned)
    .select()
    .maybeSingle();

  if (result.error && _isUserIdSchemaError(result.error)) {
    _schemaHasUserId = false;
    _warnMigration();
    const { user_id, ...rest } = record;
    return supabase.from(table).insert(rest).select().maybeSingle();
  }

  if (!result.error && "user_id" in record) {
    _schemaHasUserId = true;
  }
  return result;
}

/**
 * Upsert a record into a table, falling back to omitting user_id if the
 * column doesn't exist in the schema.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} table
 * @param {object} record
 * @param {object} [opts]
 * @returns {Promise<{data: any, error: any}>}
 */
async function safeUpsert(supabase, table, record, opts) {
  const cleaned = stripUserId(record);
  const q = opts
    ? supabase.from(table).upsert(cleaned, opts)
    : supabase.from(table).upsert(cleaned);
  const result = await q.select().maybeSingle();

  if (result.error && _isUserIdSchemaError(result.error)) {
    _schemaHasUserId = false;
    _warnMigration();
    const { user_id, ...rest } = record;
    const q2 = opts
      ? supabase.from(table).upsert(rest, opts)
      : supabase.from(table).upsert(rest);
    return q2.select().maybeSingle();
  }

  if (!result.error && "user_id" in record) {
    _schemaHasUserId = true;
  }
  return result;
}

module.exports = {
  getSupabase,
  getUserId,
  setUserSession,
  clearUserSession,
  reconfigure,
  safeInsert,
  safeUpsert,
  stripUserId,
};
