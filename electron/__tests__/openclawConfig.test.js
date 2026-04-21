/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";

const require_ = createRequire(import.meta.url);
const pathUtilsPath = require_.resolve("../../electron/services/pathUtils.js");
const openclawConfigPath = require_.resolve(
  "../../electron/services/openclawConfig.js",
);

describe("openclawConfig", () => {
  let buildConfig, writeConfig, readConfig;
  let mockFsPromises;
  let mockSafeReadFile;

  beforeEach(() => {
    // Clear module caches
    delete require_.cache[openclawConfigPath];
    Object.keys(require_.cache).forEach((key) => {
      if (key.includes("openclawConfig")) delete require_.cache[key];
    });

    // Create fs.promises mock
    mockFsPromises = {
      mkdir: vi.fn(() => Promise.resolve()),
      writeFile: vi.fn(() => Promise.resolve()),
    };
    require_.cache["fs"] = {
      id: "fs",
      filename: "fs",
      loaded: true,
      exports: { promises: mockFsPromises },
    };

    // Create pathUtils mock
    mockSafeReadFile = vi.fn(() => Promise.resolve(null));
    require_.cache[pathUtilsPath] = {
      id: pathUtilsPath,
      filename: pathUtilsPath,
      loaded: true,
      exports: {
        getOpenClawBase: vi.fn(() => "/test/.openclaw"),
        getWorkspacePath: vi.fn((id) => `/test/.openclaw/workspace-${id}`),
        getAgentDir: vi.fn((id) => `/test/.openclaw/agents/${id}`),
        safeReadFile: mockSafeReadFile,
      },
    };

    // Load module under test
    const mod = require_(openclawConfigPath);
    buildConfig = mod.buildConfig;
    writeConfig = mod.writeConfig;
    readConfig = mod.readConfig;
  });

  afterEach(() => {
    delete require_.cache["fs"];
    delete require_.cache[pathUtilsPath];
    delete require_.cache[openclawConfigPath];
  });

  // ==========================================================================
  // buildConfig (pure function)
  // ==========================================================================

  it("maps agents to config structure with correct fields", () => {
    const agents = [
      {
        id: "coder",
        name: "Coder",
        model: "gemini/gemini-2.0-flash",
        workspace: "/custom/workspace",
        tools_allow: ["write_file", "execute_code"],
        tools_deny: [],
        sandbox_mode: "all",
      },
    ];

    const config = buildConfig(agents);

    expect(config.agents.list).toHaveLength(1);
    const agent = config.agents.list[0];
    expect(agent.id).toBe("coder");
    expect(agent.identity.name).toBe("Coder");
    expect(agent.workspace).toBe("/custom/workspace");
    expect(agent.model).toBe("gemini/gemini-2.0-flash");
    expect(agent.tools).toEqual({
      allow: ["write_file", "execute_code"],
      deny: [],
    });
    expect(agent.sandbox).toEqual({ mode: "all" });
    expect(agent.agentDir).toContain("agents/coder");
  });

  it("detects default model from majority of agents", () => {
    const agents = [
      { id: "a1", name: "A1", model: "gemini/gemini-2.0-flash" },
      { id: "a2", name: "A2", model: "gemini/gemini-2.0-flash" },
      { id: "a3", name: "A3", model: "gemini/gemini-1.5-pro" },
    ];

    const config = buildConfig(agents);
    expect(config.agents.defaults.model.primary).toBe(
      "gemini/gemini-2.0-flash",
    );
  });

  it("detects minority model as default when it has more entries", () => {
    const agents = [
      { id: "a1", name: "A1", model: "gemini/gemini-1.5-pro" },
      { id: "a2", name: "A2", model: "gemini/gemini-1.5-pro" },
      { id: "a3", name: "A3", model: "gemini/gemini-1.5-pro" },
      { id: "a4", name: "A4", model: "gemini/gemini-2.0-flash" },
    ];

    const config = buildConfig(agents);
    expect(config.agents.defaults.model.primary).toBe("gemini/gemini-1.5-pro");
  });

  it("handles empty agents array with fallback default model", () => {
    const config = buildConfig([]);

    expect(config.agents.list).toEqual([]);
    expect(config.agents.defaults.model.primary).toBe(
      "gemini/gemini-2.0-flash",
    );
  });

  it("does not include timeoutSeconds or contextTokens in defaults", () => {
    const config = buildConfig([]);

    expect(config.agents.defaults).not.toHaveProperty("timeoutSeconds");
    expect(config.agents.defaults).not.toHaveProperty("contextTokens");
  });

  it("trims whitespace and newlines from model strings", () => {
    const agents = [
      { id: "test", name: "Test", model: "google/gemini-2.0-flash\n" },
    ];
    const config = buildConfig(agents);

    expect(config.agents.list[0].model).toBe("google/gemini-2.0-flash");
    expect(config.agents.defaults.model.primary).toBe(
      "google/gemini-2.0-flash",
    );
  });

  it("includes gateway, skills, and session sections", () => {
    const config = buildConfig([]);

    expect(config.gateway).toEqual({
      mode: "local",
      port: 18789,
      bind: "loopback",
      auth: { mode: "token" },
      controlUi: { enabled: true, basePath: "/openclaw" },
      reload: { mode: "hybrid" },
    });
    expect(config.tools).toEqual({
      profile: "coding",
      exec: { backgroundMs: 10000, timeoutSec: 1800 },
      sessions: { visibility: "tree" },
    });
    expect(config.skills).toEqual({
      entries: {},
      load: { watch: true, watchDebounceMs: 500 },
    });
    expect(config.session).toEqual({
      scope: "per-sender",
      dmScope: "main",
      reset: { mode: "daily", atHour: 4 },
      maintenance: { pruneAfter: "30d", maxEntries: 500 },
    });
    expect(config.bindings).toEqual([]);
  });

  it("does not include gatewayToken in tools section", () => {
    const config = buildConfig([]);
    expect(config.tools).not.toHaveProperty("gatewayToken");
  });

  it("accepts custom gateway options", () => {
    const config = buildConfig([], { gatewayPort: 9999, authMode: "none" });

    expect(config.gateway.port).toBe(9999);
    expect(config.gateway.auth.mode).toBe("none");
  });

  it("falls back to generated workspace path when agent has no workspace", () => {
    const agents = [
      { id: "test", name: "Test", model: "gemini/gemini-2.0-flash" },
    ];
    const config = buildConfig(agents);

    expect(config.agents.list[0].workspace).toContain("workspace-test");
  });

  it("defaults tools to empty arrays when not provided", () => {
    const agents = [
      { id: "test", name: "Test", model: "gemini/gemini-2.0-flash" },
    ];
    const config = buildConfig(agents);

    expect(config.agents.list[0].tools).toEqual({ allow: [], deny: [] });
  });

  it("defaults sandbox mode to all when not provided", () => {
    const agents = [
      { id: "test", name: "Test", model: "gemini/gemini-2.0-flash" },
    ];
    const config = buildConfig(agents);

    expect(config.agents.list[0].sandbox).toEqual({ mode: "all" });
  });

  it("maps all 9 preset agents correctly", () => {
    const presets = [
      {
        id: "orchestrator",
        name: "Orchestrator",
        model: "gemini/gemini-1.5-pro",
        tools_allow: ["exec", "read", "write"],
        tools_deny: [],
        sandbox_mode: "all",
      },
      {
        id: "pm",
        name: "PM",
        model: "gemini/gemini-2.0-flash",
        tools_allow: [],
        tools_deny: [],
        sandbox_mode: "all",
      },
      {
        id: "coder",
        name: "Coder",
        model: "gemini/gemini-2.0-flash",
        tools_allow: ["execute_code", "write_file"],
        tools_deny: [],
        sandbox_mode: "all",
      },
      {
        id: "qa",
        name: "QA",
        model: "gemini/gemini-2.0-flash",
        tools_allow: ["execute_code", "read_file"],
        tools_deny: ["write_file"],
        sandbox_mode: "all",
      },
      {
        id: "cybersec",
        name: "Cybersec",
        model: "gemini/gemini-2.0-flash",
        tools_allow: ["read_file"],
        tools_deny: ["execute_code", "write_file"],
        sandbox_mode: "all",
      },
      {
        id: "design",
        name: "Design",
        model: "gemini/gemini-2.0-flash",
        tools_allow: [],
        tools_deny: [],
        sandbox_mode: "all",
      },
      {
        id: "marketing",
        name: "Marketing",
        model: "gemini/gemini-2.0-flash",
        tools_allow: [],
        tools_deny: [],
        sandbox_mode: "all",
      },
      {
        id: "research",
        name: "Research",
        model: "gemini/gemini-2.0-flash",
        tools_allow: [],
        tools_deny: [],
        sandbox_mode: "all",
      },
      {
        id: "patrol",
        name: "Patrol",
        model: "gemini/gemini-2.0-flash",
        tools_allow: ["read_file"],
        tools_deny: ["execute_code", "write_file"],
        sandbox_mode: "all",
      },
    ];

    const config = buildConfig(presets);

    expect(config.agents.list).toHaveLength(9);
    expect(config.agents.defaults.model.primary).toBe(
      "gemini/gemini-2.0-flash",
    );

    const coderConfig = config.agents.list.find((a) => a.id === "coder");
    expect(coderConfig.tools.allow).toContain("execute_code");
    expect(coderConfig.tools.allow).toContain("write_file");

    const cybersecConfig = config.agents.list.find((a) => a.id === "cybersec");
    expect(cybersecConfig.tools.deny).toContain("execute_code");
  });

  // ==========================================================================
  // writeConfig
  // ==========================================================================

  it("writes valid JSON config to disk", async () => {
    const agents = [
      { id: "coder", name: "Coder", model: "gemini/gemini-2.0-flash" },
    ];
    const result = await writeConfig(agents);

    expect(result.written).toBe(true);
    expect(result.agentCount).toBe(1);
    expect(result.path).toContain("openclaw.json");
    expect(mockFsPromises.mkdir).toHaveBeenCalled();
    expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("openclaw.json"),
      expect.any(String),
      "utf-8",
    );

    // Verify the written content is valid JSON with expected structure
    const writtenContent = mockFsPromises.writeFile.mock.calls[0][1];
    const parsed = JSON.parse(writtenContent);
    expect(parsed.agents.list).toHaveLength(1);
    expect(parsed.agents.list[0].id).toBe("coder");
    expect(parsed.gateway.port).toBe(18789);
  });

  it("creates the base directory before writing", async () => {
    await writeConfig([]);

    expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
      expect.stringContaining(".openclaw"),
      { recursive: true },
    );
  });

  it("passes options through to buildConfig", async () => {
    await writeConfig([], { gatewayPort: 9999 });

    const writtenContent = mockFsPromises.writeFile.mock.calls[0][1];
    const parsed = JSON.parse(writtenContent);
    expect(parsed.gateway.port).toBe(9999);
  });

  it("preserves CLI-managed sections (plugins, wizard, meta) on merge", async () => {
    const existingConfig = {
      agents: { defaults: {}, list: [] },
      gateway: { port: 18789 },
      plugins: { entries: { browser: { enabled: true } } },
      wizard: {
        lastRunAt: "2026-04-03T01:49:59.038Z",
        lastRunVersion: "2026.4.2",
      },
      meta: { lastTouchedVersion: "2026.4.2" },
    };
    mockSafeReadFile.mockResolvedValue(JSON.stringify(existingConfig));

    await writeConfig([]);

    const writtenContent = mockFsPromises.writeFile.mock.calls[0][1];
    const parsed = JSON.parse(writtenContent);
    expect(parsed.plugins).toEqual({ entries: { browser: { enabled: true } } });
    expect(parsed.wizard.lastRunVersion).toBe("2026.4.2");
    expect(parsed.meta.lastTouchedVersion).toBe("2026.4.2");
  });

  it("preserves gateway.auth.token from existing config", async () => {
    const existingConfig = {
      agents: { defaults: {}, list: [] },
      gateway: { auth: { mode: "token", token: "existing-secret-token" } },
    };
    mockSafeReadFile.mockResolvedValue(JSON.stringify(existingConfig));

    await writeConfig([]);

    const writtenContent = mockFsPromises.writeFile.mock.calls[0][1];
    const parsed = JSON.parse(writtenContent);
    expect(parsed.gateway.auth.token).toBe("existing-secret-token");
    expect(parsed.gateway.auth.mode).toBe("token");
  });

  it("works cleanly when no existing config exists", async () => {
    mockSafeReadFile.mockResolvedValue(null);

    await writeConfig([]);

    const writtenContent = mockFsPromises.writeFile.mock.calls[0][1];
    const parsed = JSON.parse(writtenContent);
    expect(parsed.agents).toBeDefined();
    expect(parsed.gateway).toBeDefined();
    expect(parsed.plugins).toBeUndefined();
    expect(parsed.wizard).toBeUndefined();
    expect(parsed.meta).toBeUndefined();
  });

  // ==========================================================================
  // readConfig
  // ==========================================================================

  it("reads and parses config from disk", async () => {
    const mockConfig = { agents: { list: [] }, gateway: { port: 18789 } };
    mockSafeReadFile.mockResolvedValue(JSON.stringify(mockConfig));

    const config = await readConfig();
    expect(config).toEqual(mockConfig);
  });

  it("returns null when config file does not exist", async () => {
    mockSafeReadFile.mockResolvedValue(null);

    const config = await readConfig();
    expect(config).toBeNull();
  });

  it("returns null for invalid JSON content", async () => {
    mockSafeReadFile.mockResolvedValue("not valid json {{{");

    const config = await readConfig();
    expect(config).toBeNull();
  });

  it("round-trips through write and read", async () => {
    const agents = [
      {
        id: "coder",
        name: "Coder",
        model: "gemini/gemini-2.0-flash",
        tools_allow: ["write_file"],
        tools_deny: [],
        sandbox_mode: "all",
      },
    ];

    await writeConfig(agents);

    // Simulate readConfig reading what writeConfig wrote
    const writtenContent = mockFsPromises.writeFile.mock.calls[0][1];
    mockSafeReadFile.mockResolvedValue(writtenContent);

    const config = await readConfig();
    expect(config.agents.list).toHaveLength(1);
    expect(config.agents.list[0].id).toBe("coder");
    expect(config.agents.list[0].tools.allow).toContain("write_file");
  });
});
