/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";

/**
 * supabase.js is CJS: `const { createClient } = require('@supabase/supabase-js')`.
 * Module-level singleton: `let supabaseInstance = null`.
 *
 * Strategy: seed Node's require cache with a mock @supabase/supabase-js before
 * requiring supabase.js, so it picks up our mockCreateClient.
 */

const mockCreateClient = vi.fn(() => ({
  from: vi.fn(),
  auth: { getSession: vi.fn() },
}));

const require_ = createRequire(import.meta.url);
const supabaseSdkPath = require_.resolve("@supabase/supabase-js");
const supabaseServicePath = require_.resolve(
  "../../electron/services/supabase.js",
);

// Save the original cache entry so we can restore it
const originalSdkCache = require_.cache[supabaseSdkPath];

describe("supabase service", () => {
  let getSupabase;
  let reconfigure;

  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;

    mockCreateClient.mockClear();
    mockCreateClient.mockImplementation(() => ({
      from: vi.fn(),
      auth: { getSession: vi.fn() },
    }));

    // Clear the service module from cache to reset the singleton
    delete require_.cache[supabaseServicePath];

    // Seed the require cache with our mock
    require_.cache[supabaseSdkPath] = {
      id: supabaseSdkPath,
      filename: supabaseSdkPath,
      loaded: true,
      exports: { createClient: mockCreateClient },
    };

    const mod = require_(supabaseServicePath);
    getSupabase = mod.getSupabase;
    reconfigure = mod.reconfigure;
  });

  afterEach(() => {
    // Restore original SDK cache entry
    if (originalSdkCache) {
      require_.cache[supabaseSdkPath] = originalSdkCache;
    } else {
      delete require_.cache[supabaseSdkPath];
    }
  });

  it("returns null when env vars not set", () => {
    const result = getSupabase();
    expect(result).toBeNull();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("creates client when env vars set", () => {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_ANON_KEY = "test-anon-key-123";

    const result = getSupabase();

    expect(result).not.toBeNull();
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockCreateClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "test-anon-key-123",
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: false,
          persistSession: false,
        }),
      }),
    );
  });

  it("returns same instance (singleton)", () => {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_ANON_KEY = "test-anon-key-123";

    const first = getSupabase();
    const second = getSupabase();

    expect(first).toBe(second);
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
  });

  it("reconfigure creates new client", () => {
    process.env.SUPABASE_URL = "https://old.supabase.co";
    process.env.SUPABASE_ANON_KEY = "old-key";
    getSupabase();

    expect(mockCreateClient).toHaveBeenCalledTimes(1);

    const newClient = reconfigure("https://new.supabase.co", "new-key-456");

    expect(newClient).not.toBeNull();
    expect(mockCreateClient).toHaveBeenCalledTimes(2);
    expect(mockCreateClient).toHaveBeenLastCalledWith(
      "https://new.supabase.co",
      "new-key-456",
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: false,
          persistSession: false,
        }),
      }),
    );

    const afterReconfigure = getSupabase();
    expect(afterReconfigure).toBe(newClient);
    expect(mockCreateClient).toHaveBeenCalledTimes(2);
  });

  it("reconfigure throws when missing args", () => {
    expect(() => reconfigure(null, "key")).toThrow(
      "Both url and anonKey are required",
    );
    expect(() => reconfigure("url", "")).toThrow(
      "Both url and anonKey are required",
    );
  });
});
