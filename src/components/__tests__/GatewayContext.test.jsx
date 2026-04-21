import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { useContext } from "react";
import { GatewayContext, GatewayProvider } from "../../contexts/GatewayContext";
import useAgentStore from "../../store/agentStore";
import useTaskStore from "../../store/taskStore";

// Capture registered event callbacks from window.hivemind.on
let registeredCallbacks;
let cleanupFunctions;

function Consumer() {
  const { status, error } = useContext(GatewayContext);
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="error">{error || "none"}</span>
    </div>
  );
}

describe("GatewayContext", () => {
  beforeEach(() => {
    registeredCallbacks = {};
    cleanupFunctions = {};

    // Mock window.hivemind.on to capture callbacks and return cleanup functions
    window.hivemind = {
      invoke: vi.fn((channel) => {
        if (channel === "gateway:status") {
          return Promise.resolve({ connected: false });
        }
        return Promise.resolve(undefined);
      }),
      on: vi.fn((eventName, handler) => {
        registeredCallbacks[eventName] = handler;
        const cleanupFn = vi.fn();
        cleanupFunctions[eventName] = cleanupFn;
        return cleanupFn;
      }),
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("registers event listeners on mount", () => {
    render(
      <GatewayProvider>
        <Consumer />
      </GatewayProvider>,
    );

    const expectedEvents = [
      "gateway:connected",
      "gateway:disconnected",
      "gateway:error",
      "gateway:event",
      "security:checkpoint",
      "agent:status-changed",
      "agent:message-received",
      "task:started",
      "task:progress",
      "task:completed",
      "task:cancelled",
      "task:failed",
    ];

    for (const event of expectedEvents) {
      expect(registeredCallbacks[event]).toBeDefined();
      expect(typeof registeredCallbacks[event]).toBe("function");
    }
  });

  it("cleans up listeners on unmount", () => {
    const { unmount } = render(
      <GatewayProvider>
        <Consumer />
      </GatewayProvider>,
    );

    // Verify cleanup functions were returned from on()
    const cleanupEntries = Object.values(cleanupFunctions);
    expect(cleanupEntries.length).toBeGreaterThan(0);

    // Unmount triggers cleanup
    unmount();

    // All cleanup functions should have been called
    for (const cleanupFn of cleanupEntries) {
      expect(cleanupFn).toHaveBeenCalled();
    }
  });

  it("provides connected status", () => {
    render(
      <GatewayProvider>
        <Consumer />
      </GatewayProvider>,
    );

    act(() => {
      registeredCallbacks["gateway:connected"]({ url: "ws://127.0.0.1:18789" });
    });

    expect(screen.getByTestId("status").textContent).toBe("connected");
    expect(screen.getByTestId("error").textContent).toBe("none");
  });

  it("provides disconnected status", () => {
    render(
      <GatewayProvider>
        <Consumer />
      </GatewayProvider>,
    );

    // First connect, then disconnect
    act(() => {
      registeredCallbacks["gateway:connected"]({ url: "ws://127.0.0.1:18789" });
    });
    expect(screen.getByTestId("status").textContent).toBe("connected");

    act(() => {
      registeredCallbacks["gateway:disconnected"]();
    });
    expect(screen.getByTestId("status").textContent).toBe("disconnected");
  });

  it("provides error on gateway:error", () => {
    render(
      <GatewayProvider>
        <Consumer />
      </GatewayProvider>,
    );

    act(() => {
      registeredCallbacks["gateway:error"]({ message: "Connection refused" });
    });

    expect(screen.getByTestId("status").textContent).toBe("error");
    expect(screen.getByTestId("error").textContent).toBe("Connection refused");
  });

  // -------------------------------------------------------
  // Agent event normalization (flat vs nested payloads)
  // -------------------------------------------------------

  it("handles flat agent status events", () => {
    render(
      <GatewayProvider>
        <Consumer />
      </GatewayProvider>,
    );

    // Pre-populate agent in store
    useAgentStore.setState({
      agents: {
        a1: { id: "a1", name: "Alpha", status: "idle", currentAction: null },
      },
    });

    act(() => {
      registeredCallbacks["gateway:event"]({
        event: "agent",
        payload: {
          type: "status",
          agentId: "a1",
          status: "running",
          currentAction: "Compiling code",
        },
      });
    });

    const state = useAgentStore.getState();
    expect(state.agents["a1"].status).toBe("running");
    expect(state.agents["a1"].currentAction).toBe("Compiling code");
  });

  it("handles nested agent status events (content wrapper)", () => {
    render(
      <GatewayProvider>
        <Consumer />
      </GatewayProvider>,
    );

    useAgentStore.setState({
      agents: {
        a1: { id: "a1", name: "Alpha", status: "idle", currentAction: null },
      },
    });

    act(() => {
      registeredCallbacks["gateway:event"]({
        event: "agent",
        payload: {
          type: "status",
          agentId: "a1",
          content: {
            status: "running",
            currentAction: "Writing tests",
          },
        },
      });
    });

    const state = useAgentStore.getState();
    expect(state.agents["a1"].status).toBe("running");
    expect(state.agents["a1"].currentAction).toBe("Writing tests");
  });

  it("adds feed messages from agent events", () => {
    render(
      <GatewayProvider>
        <Consumer />
      </GatewayProvider>,
    );

    useAgentStore.setState({
      agents: {
        a1: { id: "a1", name: "Alpha", status: "running", currentAction: null },
      },
    });
    useTaskStore.setState({ feedMessages: [] });

    act(() => {
      registeredCallbacks["gateway:event"]({
        event: "agent",
        payload: {
          type: "message",
          agentId: "a1",
          agentName: "Alpha",
          content: { text: "Deployed successfully" },
        },
      });
    });

    const feed = useTaskStore.getState().feedMessages;
    expect(feed.length).toBeGreaterThan(0);
    expect(feed[0].content).toBe("Deployed successfully");
    expect(feed[0].agentName).toBe("Alpha");
  });

  // -------------------------------------------------------
  // Dedicated channel events
  // -------------------------------------------------------

  it("agent:status-changed updates agent store", () => {
    render(
      <GatewayProvider>
        <Consumer />
      </GatewayProvider>,
    );

    useAgentStore.setState({
      agents: { a1: { id: "a1", status: "idle", currentAction: null } },
    });

    act(() => {
      registeredCallbacks["agent:status-changed"]({
        agentId: "a1",
        status: "running",
        currentAction: "Scanning files",
      });
    });

    const state = useAgentStore.getState();
    expect(state.agents["a1"].status).toBe("running");
    expect(state.agents["a1"].currentAction).toBe("Scanning files");
  });

  it("security:checkpoint triggers checkpoint in agent store", () => {
    render(
      <GatewayProvider>
        <Consumer />
      </GatewayProvider>,
    );

    useAgentStore.setState({
      agents: { a1: { id: "a1", status: "running", currentAction: "writing" } },
    });
    useTaskStore.setState({ feedMessages: [] });

    act(() => {
      registeredCallbacks["security:checkpoint"]({
        checkpointId: "cp-1",
        agentId: "a1",
        action: "rm -rf /tmp",
        description: "Delete temp files",
        risk: "high",
      });
    });

    const agentState = useAgentStore.getState();
    expect(agentState.agents["a1"].status).toBe("paused");
    expect(agentState.activeCheckpoint).toBeDefined();
    expect(agentState.activeCheckpoint.id).toBe("cp-1");

    const feed = useTaskStore.getState().feedMessages;
    expect(feed.length).toBeGreaterThan(0);
    expect(feed[0].type).toBe("security");
  });

  // -------------------------------------------------------
  // Task lifecycle events
  // -------------------------------------------------------

  it("task:started adds task to store", () => {
    render(
      <GatewayProvider>
        <Consumer />
      </GatewayProvider>,
    );

    useTaskStore.setState({ tasks: [], feedMessages: [] });

    act(() => {
      registeredCallbacks["task:started"]({
        taskId: "t1",
        goal: "Build REST API",
        agentId: "coder",
      });
    });

    const state = useTaskStore.getState();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].id).toBe("t1");
    expect(state.tasks[0].status).toBe("running");
    expect(state.feedMessages.length).toBeGreaterThan(0);
  });

  it("task:progress updates task progress", () => {
    render(
      <GatewayProvider>
        <Consumer />
      </GatewayProvider>,
    );

    useTaskStore.setState({
      tasks: [
        {
          id: "t1",
          goal: "Build API",
          status: "running",
          progress: 0,
          result: null,
          error: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      feedMessages: [],
    });

    act(() => {
      registeredCallbacks["task:progress"]({
        taskId: "t1",
        progress: 50,
      });
    });

    const state = useTaskStore.getState();
    expect(state.tasks[0].progress).toBe(50);
    expect(state.tasks[0].status).toBe("running");
  });

  it("task:completed marks task done and resets agent", () => {
    render(
      <GatewayProvider>
        <Consumer />
      </GatewayProvider>,
    );

    useAgentStore.setState({
      agents: {
        coder: { id: "coder", status: "running", currentAction: "Building" },
      },
    });
    useTaskStore.setState({
      tasks: [
        {
          id: "t1",
          goal: "Build API",
          status: "running",
          progress: 80,
          result: null,
          error: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      feedMessages: [],
    });

    act(() => {
      registeredCallbacks["task:completed"]({
        taskId: "t1",
        agentId: "coder",
        result: "API built successfully",
        goal: "Build API",
      });
    });

    const taskState = useTaskStore.getState();
    expect(taskState.tasks[0].status).toBe("completed");
    expect(taskState.tasks[0].progress).toBe(100);
    expect(taskState.tasks[0].result).toBe("API built successfully");

    const agentState = useAgentStore.getState();
    expect(agentState.agents["coder"].status).toBe("idle");
  });

  it("task:failed marks task and agent as error", () => {
    render(
      <GatewayProvider>
        <Consumer />
      </GatewayProvider>,
    );

    useAgentStore.setState({
      agents: {
        coder: { id: "coder", status: "running", currentAction: "Building" },
      },
    });
    useTaskStore.setState({
      tasks: [
        {
          id: "t1",
          goal: "Deploy",
          status: "running",
          progress: 30,
          result: null,
          error: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      feedMessages: [],
    });

    act(() => {
      registeredCallbacks["task:failed"]({
        taskId: "t1",
        agentId: "coder",
        error: "Deployment failed: connection timeout",
      });
    });

    const taskState = useTaskStore.getState();
    expect(taskState.tasks[0].status).toBe("failed");
    expect(taskState.tasks[0].error).toBe(
      "Deployment failed: connection timeout",
    );

    const agentState = useAgentStore.getState();
    expect(agentState.agents["coder"].status).toBe("error");
  });

  it("ignores gateway:event with null payload", () => {
    render(
      <GatewayProvider>
        <Consumer />
      </GatewayProvider>,
    );

    // Should not throw
    act(() => {
      registeredCallbacks["gateway:event"](null);
      registeredCallbacks["gateway:event"]({ event: "agent", payload: null });
      registeredCallbacks["gateway:event"]({ event: "agent" });
    });

    // No crash is the assertion — we just verify it doesn't throw
    expect(screen.getByTestId("status")).toBeInTheDocument();
  });
});
