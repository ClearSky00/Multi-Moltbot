import { describe, it, expect, beforeEach } from "vitest";
import {
  listAgents,
  getAgent,
  upsertAgent,
  deleteAgent,
  listTasks,
  createTask,
  deleteTask,
  appendAudit,
  listAudit,
  getSetting,
  setSetting,
} from "../db";

describe("db service", () => {
  beforeEach(() => {
    window.hivemind.invoke.mockClear();
    window.hivemind.invoke.mockResolvedValue(undefined);
  });

  it("listAgents calls db:agents:list", async () => {
    const expected = [{ id: "a1" }];
    window.hivemind.invoke.mockResolvedValueOnce(expected);

    const result = await listAgents();

    expect(window.hivemind.invoke).toHaveBeenCalledWith(
      "db:agents:list",
      undefined,
    );
    expect(result).toEqual(expected);
  });

  it("getAgent calls db:agents:get with { id }", async () => {
    const expected = { id: "agent-1", name: "Alpha" };
    window.hivemind.invoke.mockResolvedValueOnce(expected);

    const result = await getAgent("agent-1");

    expect(window.hivemind.invoke).toHaveBeenCalledWith("db:agents:get", {
      id: "agent-1",
    });
    expect(result).toEqual(expected);
  });

  it("upsertAgent calls db:agents:upsert with { agent }", async () => {
    const agentDef = { id: "agent-2", name: "Bravo", role: "coder" };
    window.hivemind.invoke.mockResolvedValueOnce(agentDef);

    const result = await upsertAgent(agentDef);

    expect(window.hivemind.invoke).toHaveBeenCalledWith("db:agents:upsert", {
      agent: agentDef,
    });
    expect(result).toEqual(agentDef);
  });

  it("deleteAgent calls db:agents:delete with { id }", async () => {
    await deleteAgent("agent-3");

    expect(window.hivemind.invoke).toHaveBeenCalledWith("db:agents:delete", {
      id: "agent-3",
    });
  });

  it("listTasks calls db:tasks:list", async () => {
    const expected = [{ id: "t1" }, { id: "t2" }];
    window.hivemind.invoke.mockResolvedValueOnce(expected);

    const result = await listTasks();

    expect(window.hivemind.invoke).toHaveBeenCalledWith(
      "db:tasks:list",
      undefined,
    );
    expect(result).toEqual(expected);
  });

  it("createTask calls db:tasks:create with { task }", async () => {
    const task = { title: "Build feature", priority: "high" };
    window.hivemind.invoke.mockResolvedValueOnce(task);

    const result = await createTask(task);

    expect(window.hivemind.invoke).toHaveBeenCalledWith("db:tasks:create", {
      task,
    });
    expect(result).toEqual(task);
  });

  it("deleteTask calls db:tasks:delete with { id }", async () => {
    await deleteTask("task-uuid");

    expect(window.hivemind.invoke).toHaveBeenCalledWith("db:tasks:delete", {
      id: "task-uuid",
    });
  });

  it("appendAudit calls db:audit:append with { entry }", async () => {
    const entry = { action: "file_write", agentId: "a1", timestamp: 1234 };

    await appendAudit(entry);

    expect(window.hivemind.invoke).toHaveBeenCalledWith("db:audit:append", {
      entry,
    });
  });

  it("listAudit calls db:audit:list", async () => {
    const filters = { agentId: "a1", limit: 50 };
    const expected = [{ id: "log1" }];
    window.hivemind.invoke.mockResolvedValueOnce(expected);

    const result = await listAudit(filters);

    expect(window.hivemind.invoke).toHaveBeenCalledWith(
      "db:audit:list",
      filters,
    );
    expect(result).toEqual(expected);
  });

  it("getSetting calls db:settings:get", async () => {
    window.hivemind.invoke.mockResolvedValueOnce("dark");

    const result = await getSetting("theme");

    expect(window.hivemind.invoke).toHaveBeenCalledWith("db:settings:get", {
      key: "theme",
    });
    expect(result).toBe("dark");
  });

  it("setSetting calls db:settings:set", async () => {
    await setSetting("theme", "light");

    expect(window.hivemind.invoke).toHaveBeenCalledWith("db:settings:set", {
      key: "theme",
      value: "light",
    });
  });
});
