import { describe, it, expect, vi, beforeEach } from "vitest";
import { useTaskStore } from "../taskStore";

vi.mock("../../services/db", () => ({
  listTasks: vi.fn(),
}));

const db = await import("../../services/db");

const initialState = {
  tasks: [],
  feedMessages: [],
  MAX_FEED_ENTRIES: 300,
};

describe("taskStore", () => {
  beforeEach(() => {
    useTaskStore.setState(initialState);
    vi.clearAllMocks();
  });

  // -------------------------------------------------------
  it("initializes with empty tasks and feedMessages", () => {
    const state = useTaskStore.getState();
    expect(state.tasks).toEqual([]);
    expect(state.feedMessages).toEqual([]);
    expect(state.MAX_FEED_ENTRIES).toBe(300);
  });

  // -------------------------------------------------------
  it("addFeedMessage prepends with id and timestamp", () => {
    useTaskStore.getState().addFeedMessage({
      type: "info",
      content: "Agent started scanning",
      agentId: "a1",
      agentName: "Alpha",
    });

    const state = useTaskStore.getState();
    expect(state.feedMessages).toHaveLength(1);

    const msg = state.feedMessages[0];
    expect(msg.id).toBeDefined();
    expect(typeof msg.id).toBe("string");
    expect(msg.type).toBe("info");
    expect(msg.content).toBe("Agent started scanning");
    expect(msg.agentId).toBe("a1");
    expect(msg.agentName).toBe("Alpha");
    expect(msg.timestamp).toBeDefined();
    expect(typeof msg.timestamp).toBe("number");

    // Second message should prepend (newest first)
    useTaskStore.getState().addFeedMessage({
      type: "warn",
      content: "Rate limit approaching",
    });

    const updated = useTaskStore.getState();
    expect(updated.feedMessages).toHaveLength(2);
    expect(updated.feedMessages[0].content).toBe("Rate limit approaching");
    expect(updated.feedMessages[1].content).toBe("Agent started scanning");
  });

  // -------------------------------------------------------
  it("addFeedMessage caps at 300", () => {
    // Pre-fill with 300 messages
    const existing = Array.from({ length: 300 }, (_, i) => ({
      id: `feed-existing-${i}`,
      type: "info",
      agentId: null,
      agentName: null,
      content: `msg-${i}`,
      detail: null,
      timestamp: 1000 + i,
    }));
    useTaskStore.setState({ feedMessages: existing });

    // Adding one more should keep the total at 300
    useTaskStore.getState().addFeedMessage({
      content: "overflow message",
    });

    const state = useTaskStore.getState();
    expect(state.feedMessages).toHaveLength(300);
    expect(state.feedMessages[0].content).toBe("overflow message");
    // Oldest entry should have been trimmed
    expect(state.feedMessages[299].content).toBe("msg-298");
  });

  // -------------------------------------------------------
  it("clearFeed empties feedMessages", () => {
    useTaskStore.setState({
      feedMessages: [
        { id: "1", type: "info", content: "hello", timestamp: 1000 },
        { id: "2", type: "info", content: "world", timestamp: 1001 },
      ],
    });

    useTaskStore.getState().clearFeed();

    expect(useTaskStore.getState().feedMessages).toEqual([]);
  });

  // -------------------------------------------------------
  it("addTask prepends to tasks", () => {
    useTaskStore.getState().addTask({
      id: "t1",
      goal: "Build feature A",
      status: "pending",
    });
    useTaskStore.getState().addTask({
      id: "t2",
      goal: "Fix bug B",
      status: "running",
      agentId: "a2",
    });

    const state = useTaskStore.getState();
    expect(state.tasks).toHaveLength(2);
    // Newest first (prepended)
    expect(state.tasks[0].id).toBe("t2");
    expect(state.tasks[0].goal).toBe("Fix bug B");
    expect(state.tasks[0].status).toBe("running");
    expect(state.tasks[0].agentId).toBe("a2");
    expect(state.tasks[0].createdAt).toBeDefined();
    expect(state.tasks[0].updatedAt).toBeDefined();
    expect(state.tasks[0].progress).toBe(0);
    expect(state.tasks[0].result).toBeNull();
    expect(state.tasks[0].error).toBeNull();

    expect(state.tasks[1].id).toBe("t1");
    expect(state.tasks[1].goal).toBe("Build feature A");
  });

  // -------------------------------------------------------
  it("updateTask updates by id", () => {
    useTaskStore.setState({
      tasks: [
        {
          id: "t1",
          goal: "Build feature",
          status: "pending",
          progress: 0,
          result: null,
          error: null,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: "t2",
          goal: "Fix bug",
          status: "running",
          progress: 50,
          result: null,
          error: null,
          createdAt: 1001,
          updatedAt: 1001,
        },
      ],
    });

    useTaskStore
      .getState()
      .updateTask("t1", { status: "completed", progress: 100, result: "done" });

    const state = useTaskStore.getState();
    expect(state.tasks[0].id).toBe("t1");
    expect(state.tasks[0].status).toBe("completed");
    expect(state.tasks[0].progress).toBe(100);
    expect(state.tasks[0].result).toBe("done");
    expect(state.tasks[0].updatedAt).toBeGreaterThanOrEqual(Date.now() - 5000);

    // Other task unchanged
    expect(state.tasks[1].status).toBe("running");
    expect(state.tasks[1].progress).toBe(50);
  });

  // -------------------------------------------------------
  it("fetchTasks populates from DB (newest createdAt first)", async () => {
    const mockTasks = [
      {
        id: "t2",
        goal: "Deploy",
        status: "pending",
        created_at: 1000,
        updated_at: 1000,
      },
      {
        id: "t1",
        goal: "Scan repos",
        status: "completed",
        progress: 100,
        result: "ok",
        created_at: 2000,
        updated_at: 2100,
      },
    ];
    db.listTasks.mockResolvedValueOnce({ data: mockTasks });

    await useTaskStore.getState().fetchTasks();

    const state = useTaskStore.getState();
    expect(state.tasks).toHaveLength(2);
    expect(state.tasks[0]).toMatchObject({
      id: "t1",
      goal: "Scan repos",
      status: "completed",
      progress: 100,
      result: "ok",
      createdAt: 2000,
      updatedAt: 2100,
    });
    expect(state.tasks[1]).toMatchObject({
      id: "t2",
      goal: "Deploy",
      status: "pending",
      progress: 0,
      result: null,
      error: null,
    });
    expect(db.listTasks).toHaveBeenCalledOnce();
  });

  it("fetchTasks merges local running over DB pending for same id", async () => {
    useTaskStore.setState({
      tasks: [
        {
          id: "live",
          goal: "Ship feature",
          status: "running",
          progress: 42,
          createdAt: 3000,
          updatedAt: 3000,
          result: null,
          error: null,
        },
      ],
    });
    db.listTasks.mockResolvedValueOnce({
      data: [
        {
          id: "live",
          goal: "Ship feature",
          status: "pending",
          created_at: 3000,
          updated_at: 3000,
        },
      ],
    });

    await useTaskStore.getState().fetchTasks();

    const state = useTaskStore.getState();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toMatchObject({
      id: "live",
      status: "running",
      progress: 42,
    });
  });
});
