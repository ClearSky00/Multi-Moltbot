/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";

const require_ = createRequire(import.meta.url);
const electronPath = require_.resolve("electron");
const supabasePath = require_.resolve("../../electron/services/supabase.js");
const dbHandlersPath = require_.resolve("../../electron/ipc/dbHandlers.js");

/**
 * Creates a chainable mock Supabase client.
 * All query builder methods return the chain itself.
 * When awaited, resolves to queued results or a default empty result.
 */
function createChainableMock() {
  const queue = [];
  const chain = {};
  const methods = [
    "from",
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
    "eq",
    "order",
    "limit",
    "range",
    "single",
    "maybeSingle",
  ];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = function (resolve, reject) {
    const result =
      queue.length > 0 ? queue.shift() : { data: null, error: null };
    return Promise.resolve(result).then(resolve, reject);
  };
  chain._pushResult = (r) => queue.push(r);
  return chain;
}

describe("dbHandlers", () => {
  let handlers;
  let mockSupabase;
  let getSupabaseFn;
  const event = {};

  beforeEach(() => {
    handlers = {};
    mockSupabase = createChainableMock();
    getSupabaseFn = vi.fn(() => mockSupabase);

    // Clear cached modules
    delete require_.cache[dbHandlersPath];
    Object.keys(require_.cache).forEach((key) => {
      if (key.includes("dbHandlers")) delete require_.cache[key];
    });

    // Mock electron
    require_.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: {
        ipcMain: {
          handle: vi.fn((channel, handler) => {
            handlers[channel] = handler;
          }),
        },
      },
    };

    // Mock supabase service
    require_.cache[supabasePath] = {
      id: supabasePath,
      filename: supabasePath,
      loaded: true,
      exports: {
        getSupabase: getSupabaseFn,
        getUserId: vi.fn(() => "test-user-id-000"),
      },
    };

    // Register handlers
    const registerDbHandlers = require_(dbHandlersPath);
    registerDbHandlers();
  });

  afterEach(() => {
    delete require_.cache[electronPath];
    delete require_.cache[supabasePath];
    delete require_.cache[dbHandlersPath];
  });

  // ==========================================================================
  // All channels: Supabase not configured
  // ==========================================================================

  it("returns error from all db channels when Supabase not configured", async () => {
    getSupabaseFn.mockReturnValue(null);

    const channels = [
      ["db:agents:list", undefined],
      ["db:agents:get", { id: "coder" }],
      ["db:agents:upsert", { agent: { id: "test" } }],
      ["db:agents:delete", { id: "test" }],
      ["db:tasks:list", {}],
      ["db:tasks:create", { task: { goal: "test" } }],
      ["db:tasks:update", { id: "id1", updates: {} }],
      ["db:tasks:delete", { id: "id1" }],
      ["db:audit:append", { entry: { event_type: "test" } }],
      ["db:audit:list", {}],
      ["db:checkpoints:create", { checkpoint: { agent_id: "coder" } }],
      ["db:checkpoints:resolve", { id: "id1", decision: "approved" }],
      ["db:skills:list", {}],
      ["db:skills:upsert", { skill: { id: "test" } }],
      ["db:skills:delete", { id: "test" }],
      ["db:settings:get", { key: "theme" }],
      ["db:settings:set", { key: "theme", value: "dark" }],
    ];

    for (const [channel, params] of channels) {
      const result = await handlers[channel](event, params);
      expect(result.error).toBe("Supabase not configured");
    }
  });

  it("registers all db IPC channels", () => {
    expect(Object.keys(handlers)).toHaveLength(17);
  });

  // ==========================================================================
  // Agents
  // ==========================================================================

  it("db:agents:list returns sorted agents", async () => {
    const agents = [
      { id: "orchestrator", name: "Orchestrator", is_preset: true },
      { id: "coder", name: "Coder", is_preset: true },
    ];
    mockSupabase._pushResult({ data: agents, error: null });

    const result = await handlers["db:agents:list"](event);
    expect(result.data).toEqual(agents);
    expect(mockSupabase.from).toHaveBeenCalledWith("agents");
    expect(mockSupabase.select).toHaveBeenCalledWith("*");
    expect(mockSupabase.order).toHaveBeenCalledTimes(2);
  });

  it("db:agents:list returns error on DB failure", async () => {
    mockSupabase._pushResult({
      data: null,
      error: { message: "connection lost" },
    });

    const result = await handlers["db:agents:list"](event);
    expect(result.error).toBe("connection lost");
  });

  it("db:agents:get returns single agent by ID", async () => {
    const agent = { id: "coder", name: "Coder" };
    mockSupabase._pushResult({ data: agent, error: null });

    const result = await handlers["db:agents:get"](event, { id: "coder" });
    expect(result.data).toEqual(agent);
    expect(mockSupabase.eq).toHaveBeenCalledWith("id", "coder");
    expect(mockSupabase.single).toHaveBeenCalled();
  });

  it("db:agents:upsert adds updated_at timestamp", async () => {
    const agent = { id: "custom1", name: "Custom" };
    mockSupabase._pushResult({
      data: { ...agent, updated_at: "2026-01-01" },
      error: null,
    });

    const result = await handlers["db:agents:upsert"](event, { agent });
    expect(result.data).toBeDefined();
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "custom1",
        updated_at: expect.any(String),
      }),
      { onConflict: "id" },
    );
  });

  it("db:agents:delete prevents deleting preset agents", async () => {
    mockSupabase._pushResult({ data: { is_preset: true }, error: null });

    const result = await handlers["db:agents:delete"](event, {
      id: "orchestrator",
    });
    expect(result.error).toBe("Cannot delete a preset agent");
  });

  it("db:agents:delete allows deleting custom agents", async () => {
    mockSupabase._pushResult({ data: { is_preset: false }, error: null });
    mockSupabase._pushResult({ data: null, error: null });

    const result = await handlers["db:agents:delete"](event, { id: "custom1" });
    expect(result.data).toEqual({ deleted: true, id: "custom1" });
  });

  it("db:agents:delete returns error when fetch fails", async () => {
    mockSupabase._pushResult({ data: null, error: { message: "not found" } });

    const result = await handlers["db:agents:delete"](event, {
      id: "nonexistent",
    });
    expect(result.error).toBe("not found");
  });

  // ==========================================================================
  // Tasks
  // ==========================================================================

  it("db:tasks:list returns tasks ordered by creation date", async () => {
    const tasks = [{ id: "t1", goal: "Test" }];
    mockSupabase._pushResult({ data: tasks, error: null });

    const result = await handlers["db:tasks:list"](event, {});
    expect(result.data).toEqual(tasks);
    expect(mockSupabase.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
  });

  it("db:tasks:list respects limit and offset", async () => {
    mockSupabase._pushResult({ data: [], error: null });

    await handlers["db:tasks:list"](event, { limit: 10, offset: 20 });
    expect(mockSupabase.limit).toHaveBeenCalledWith(10);
    expect(mockSupabase.range).toHaveBeenCalledWith(20, 29);
  });

  it("db:tasks:create sets default status and timestamp", async () => {
    mockSupabase._pushResult({
      data: { id: "t1", goal: "Build", status: "pending" },
      error: null,
    });

    const result = await handlers["db:tasks:create"](event, {
      task: { goal: "Build" },
    });
    expect(result.data).toBeDefined();
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: "Build",
        status: "pending",
        created_at: expect.any(String),
      }),
    );
  });

  it("db:tasks:update passes updates through", async () => {
    mockSupabase._pushResult({
      data: { id: "t1", status: "completed" },
      error: null,
    });

    const result = await handlers["db:tasks:update"](event, {
      id: "t1",
      updates: { status: "completed", result: "done" },
    });
    expect(result.data).toBeDefined();
    expect(mockSupabase.update).toHaveBeenCalledWith({
      status: "completed",
      result: "done",
    });
    expect(mockSupabase.eq).toHaveBeenCalledWith("id", "t1");
  });

  it("db:tasks:delete succeeds with no DB row (clears UI-only / ghost tasks)", async () => {
    mockSupabase._pushResult({ data: null, error: null });

    const result = await handlers["db:tasks:delete"](event, { id: "ghost-id" });
    expect(result.data).toEqual({
      deleted: true,
      id: "ghost-id",
      localOnly: true,
    });
    expect(mockSupabase.delete).not.toHaveBeenCalled();
  });

  it("db:tasks:delete rejects unknown status", async () => {
    mockSupabase._pushResult({ data: { status: "bogus" }, error: null });

    const result = await handlers["db:tasks:delete"](event, { id: "t1" });
    expect(result.error).toMatch(/cannot be removed/i);
    expect(mockSupabase.delete).not.toHaveBeenCalled();
  });

  it("db:tasks:delete removes pending task (asks gateway to cancel)", async () => {
    mockSupabase._pushResult({ data: { status: "pending" }, error: null });
    mockSupabase._pushResult({ data: [{ id: "t1" }], error: null });

    const result = await handlers["db:tasks:delete"](event, { id: "t1" });
    expect(result.data).toEqual({ deleted: true, id: "t1" });
    expect(mockSupabase.delete).toHaveBeenCalled();
  });

  it("db:tasks:delete removes completed task", async () => {
    mockSupabase._pushResult({ data: { status: "completed" }, error: null });
    mockSupabase._pushResult({ data: [{ id: "t1" }], error: null });

    const result = await handlers["db:tasks:delete"](event, { id: "t1" });
    expect(result.data).toEqual({ deleted: true, id: "t1" });
    expect(mockSupabase.delete).toHaveBeenCalled();
  });

  it("db:tasks:delete removes failed task", async () => {
    mockSupabase._pushResult({ data: { status: "failed" }, error: null });
    mockSupabase._pushResult({ data: [{ id: "t1" }], error: null });

    const result = await handlers["db:tasks:delete"](event, { id: "t1" });
    expect(result.data).toEqual({ deleted: true, id: "t1" });
    expect(mockSupabase.delete).toHaveBeenCalled();
    expect(mockSupabase.eq).toHaveBeenCalledWith("id", "t1");
  });

  it("db:tasks:delete fails when delete affects no rows", async () => {
    mockSupabase._pushResult({ data: { status: "failed" }, error: null });
    mockSupabase._pushResult({ data: [], error: null });

    const result = await handlers["db:tasks:delete"](event, { id: "t1" });
    expect(result.error).toMatch(/could not be deleted/i);
  });

  // ==========================================================================
  // Audit Log
  // ==========================================================================

  it("db:audit:append adds created_at timestamp", async () => {
    mockSupabase._pushResult({ data: { id: "a1" }, error: null });

    const entry = { event_type: "agent_started", agent_id: "coder" };
    const result = await handlers["db:audit:append"](event, { entry });
    expect(result.data).toBeDefined();
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "agent_started",
        created_at: expect.any(String),
      }),
    );
  });

  it("db:audit:list applies filters and default limit", async () => {
    mockSupabase._pushResult({ data: [], error: null });

    await handlers["db:audit:list"](event, {
      agentId: "coder",
      actionType: "agent_started",
    });
    expect(mockSupabase.eq).toHaveBeenCalledWith("agent_id", "coder");
    expect(mockSupabase.eq).toHaveBeenCalledWith("event_type", "agent_started");
    expect(mockSupabase.limit).toHaveBeenCalledWith(200);
  });

  it("db:audit:list respects custom limit", async () => {
    mockSupabase._pushResult({ data: [], error: null });

    await handlers["db:audit:list"](event, { limit: 50 });
    expect(mockSupabase.limit).toHaveBeenCalledWith(50);
  });

  // ==========================================================================
  // Checkpoints
  // ==========================================================================

  it("db:checkpoints:create persists checkpoint with timestamp", async () => {
    const checkpoint = { agent_id: "coder", action_description: "write file" };
    mockSupabase._pushResult({
      data: { id: "cp1", ...checkpoint },
      error: null,
    });

    const result = await handlers["db:checkpoints:create"](event, {
      checkpoint,
    });
    expect(result.data).toBeDefined();
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: "coder",
        created_at: expect.any(String),
      }),
    );
  });

  it("db:checkpoints:resolve updates decision and decided_at", async () => {
    mockSupabase._pushResult({
      data: { id: "cp1", decision: "approved" },
      error: null,
    });

    const result = await handlers["db:checkpoints:resolve"](event, {
      id: "cp1",
      decision: "approved",
    });
    expect(result.data).toBeDefined();
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "approved",
        decided_at: expect.any(String),
      }),
    );
  });

  // ==========================================================================
  // Skills
  // ==========================================================================

  it("db:skills:list returns skills sorted by name", async () => {
    mockSupabase._pushResult({
      data: [{ id: "s1", name: "Alpha" }],
      error: null,
    });

    const result = await handlers["db:skills:list"](event, {});
    expect(result.data).toHaveLength(1);
    expect(mockSupabase.order).toHaveBeenCalledWith("name", {
      ascending: true,
    });
  });

  it("db:skills:list filters by agentId", async () => {
    mockSupabase._pushResult({ data: [], error: null });

    await handlers["db:skills:list"](event, { agentId: "coder" });
    expect(mockSupabase.eq).toHaveBeenCalledWith("agent_id", "coder");
  });

  it("db:skills:upsert upserts skill record", async () => {
    const skill = { id: "s1", name: "TestSkill" };
    mockSupabase._pushResult({ data: skill, error: null });

    const result = await handlers["db:skills:upsert"](event, { skill });
    expect(result.data).toEqual(skill);
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "s1",
        name: "TestSkill",
        user_id: "test-user-id-000",
      }),
      { onConflict: "id" },
    );
  });

  it("db:skills:delete removes skill", async () => {
    mockSupabase._pushResult({ data: null, error: null });

    const result = await handlers["db:skills:delete"](event, { id: "s1" });
    expect(result.data).toEqual({ deleted: true, id: "s1" });
  });

  // ==========================================================================
  // User Settings
  // ==========================================================================

  it("db:settings:get returns setting value", async () => {
    mockSupabase._pushResult({
      data: { key: "theme", value: "dark" },
      error: null,
    });

    const result = await handlers["db:settings:get"](event, { key: "theme" });
    expect(result.data).toEqual({ key: "theme", value: "dark" });
    expect(mockSupabase.eq).toHaveBeenCalledWith("key", "theme");
    expect(mockSupabase.eq).toHaveBeenCalledWith("user_id", "test-user-id-000");
  });

  it("db:settings:get returns null for missing key (PGRST116)", async () => {
    mockSupabase._pushResult({
      data: null,
      error: { code: "PGRST116", message: "not found" },
    });

    const result = await handlers["db:settings:get"](event, { key: "missing" });
    expect(result.data).toBeNull();
    expect(result.error).toBeUndefined();
  });

  it("db:settings:set upserts setting with timestamp", async () => {
    mockSupabase._pushResult({
      data: { key: "theme", value: "dark" },
      error: null,
    });

    const result = await handlers["db:settings:set"](event, {
      key: "theme",
      value: "dark",
    });
    expect(result.data).toBeDefined();
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "theme",
        value: "dark",
        updated_at: expect.any(String),
        user_id: "test-user-id-000",
      }),
      { onConflict: "key,user_id" },
    );
  });
});
