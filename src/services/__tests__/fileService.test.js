import { describe, it, expect, beforeEach } from "vitest";
import {
  readSoul,
  writeSoul,
  readAgentsMd,
  readMemory,
  readDailyLogs,
} from "../fileService";

describe("fileService", () => {
  beforeEach(() => {
    window.hivemind.invoke.mockClear();
    window.hivemind.invoke.mockResolvedValue(undefined);
  });

  it("readSoul calls file:read-soul with agentName", async () => {
    window.hivemind.invoke.mockResolvedValueOnce("# Soul of Alpha");

    const result = await readSoul("agent-alpha");

    expect(window.hivemind.invoke).toHaveBeenCalledWith("file:read-soul", {
      agentName: "agent-alpha",
    });
    expect(result).toBe("# Soul of Alpha");
  });

  it("writeSoul calls file:write-soul with agentName", async () => {
    const agentId = "agent-beta";
    const content = "# Updated soul for Beta";

    await writeSoul(agentId, content);

    expect(window.hivemind.invoke).toHaveBeenCalledWith("file:write-soul", {
      agentName: agentId,
      content,
    });
  });

  it("readAgentsMd calls file:read-agents with agentName", async () => {
    window.hivemind.invoke.mockResolvedValueOnce("# Agent instructions");

    const result = await readAgentsMd("agent-gamma");

    expect(window.hivemind.invoke).toHaveBeenCalledWith("file:read-agents", {
      agentName: "agent-gamma",
    });
    expect(result).toBe("# Agent instructions");
  });

  it("readMemory calls file:read-memory with agentName", async () => {
    window.hivemind.invoke.mockResolvedValueOnce("# Memory log entries");

    const result = await readMemory("agent-delta");

    expect(window.hivemind.invoke).toHaveBeenCalledWith("file:read-memory", {
      agentName: "agent-delta",
    });
    expect(result).toBe("# Memory log entries");
  });

  it("readDailyLogs calls file:read-daily-logs with agentName", async () => {
    const logs = { "2026-03-15": "Log entry 1", "2026-03-16": "Log entry 2" };
    window.hivemind.invoke.mockResolvedValueOnce(logs);

    const result = await readDailyLogs("agent-epsilon");

    expect(window.hivemind.invoke).toHaveBeenCalledWith(
      "file:read-daily-logs",
      { agentName: "agent-epsilon" },
    );
    expect(result).toEqual(logs);
  });
});
