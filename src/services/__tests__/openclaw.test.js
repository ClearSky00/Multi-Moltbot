import { describe, it, expect, beforeEach } from "vitest";
import {
  submitGoal,
  cancelTask,
  respondCheckpoint,
  saveApiKey,
  getApiKey,
  minimizeWindow,
  closeWindow,
  detectGateway,
  readSoul,
  writeSoul,
} from "../openclaw";

describe("openclaw service", () => {
  beforeEach(() => {
    window.hivemind.invoke.mockClear();
    window.hivemind.invoke.mockResolvedValue(undefined);
  });

  it("submitGoal calls task:submit-goal", async () => {
    const data = { goal: "Build a REST API" };
    const expected = { taskId: "task-1" };
    window.hivemind.invoke.mockResolvedValueOnce(expected);

    const result = await submitGoal(data);

    expect(window.hivemind.invoke).toHaveBeenCalledWith(
      "task:submit-goal",
      data,
    );
    expect(result).toEqual(expected);
  });

  it("cancelTask calls task:cancel", async () => {
    const data = { taskId: "task-1" };

    await cancelTask(data);

    expect(window.hivemind.invoke).toHaveBeenCalledWith("task:cancel", data);
  });

  it("respondCheckpoint calls checkpoint:respond", async () => {
    const data = { checkpointId: "cp-1", approved: true, reason: "" };

    await respondCheckpoint(data);

    expect(window.hivemind.invoke).toHaveBeenCalledWith(
      "checkpoint:respond",
      data,
    );
  });

  it("saveApiKey calls settings:save-api-key", async () => {
    const data = { provider: "anthropic", key: "sk-test-123" };

    await saveApiKey(data);

    expect(window.hivemind.invoke).toHaveBeenCalledWith(
      "settings:save-api-key",
      data,
    );
  });

  it("getApiKey calls settings:get-api-key", async () => {
    const data = { provider: "anthropic" };
    window.hivemind.invoke.mockResolvedValueOnce("sk-test-123");

    const result = await getApiKey(data);

    expect(window.hivemind.invoke).toHaveBeenCalledWith(
      "settings:get-api-key",
      data,
    );
    expect(result).toBe("sk-test-123");
  });

  it("minimizeWindow calls window:minimize", async () => {
    await minimizeWindow();

    expect(window.hivemind.invoke).toHaveBeenCalledWith(
      "window:minimize",
      undefined,
    );
  });

  it("closeWindow calls window:close", async () => {
    await closeWindow();

    expect(window.hivemind.invoke).toHaveBeenCalledWith(
      "window:close",
      undefined,
    );
  });

  it("detectGateway calls system:detect-gateway", async () => {
    const expected = { url: "ws://localhost:9090", status: "connected" };
    window.hivemind.invoke.mockResolvedValueOnce(expected);

    const result = await detectGateway();

    expect(window.hivemind.invoke).toHaveBeenCalledWith(
      "system:detect-gateway",
      undefined,
    );
    expect(result).toEqual(expected);
  });

  it("readSoul calls file:read-soul with agentName", async () => {
    const agentId = "agent-1";
    window.hivemind.invoke.mockResolvedValueOnce("# Soul content");

    const result = await readSoul(agentId);

    expect(window.hivemind.invoke).toHaveBeenCalledWith("file:read-soul", {
      agentName: agentId,
    });
    expect(result).toBe("# Soul content");
  });

  it("writeSoul calls file:write-soul with agentName", async () => {
    const agentId = "agent-1";
    const content = "# Updated soul";

    await writeSoul(agentId, content);

    expect(window.hivemind.invoke).toHaveBeenCalledWith("file:write-soul", {
      agentName: agentId,
      content,
    });
  });
});
