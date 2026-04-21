/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";

/**
 * GatewayBridge tests — covers both protocol v3 (challenge-response)
 * and v1.0 (fallback) handshakes, tick keepalive, and task DB sync.
 */

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.OPEN;
    this._handlers = {};
    this.send = vi.fn();
    this.close = vi.fn();
    this.removeAllListeners = vi.fn();
    MockWebSocket._instances.push(this);
  }

  on(event, handler) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(handler);
  }

  _emit(event, ...args) {
    const handlers = this._handlers[event] || [];
    for (const h of handlers) h(...args);
  }
}
MockWebSocket._instances = [];

const require_ = createRequire(import.meta.url);
const wsPath = require_.resolve("ws");
const bridgePath = require_.resolve("../../electron/ipc/gatewayBridge.js");
const supabasePath = require_.resolve("../../electron/services/supabase.js");

describe("GatewayBridge", () => {
  let bridge;
  let mainWindow;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket._instances = [];

    // Clear cached modules
    delete require_.cache[bridgePath];
    Object.keys(require_.cache).forEach((key) => {
      if (key.includes("gatewayBridge")) delete require_.cache[key];
    });

    // Seed ws mock
    require_.cache[wsPath] = {
      id: wsPath,
      filename: wsPath,
      loaded: true,
      exports: MockWebSocket,
    };

    // Seed supabase mock for task sync tests
    require_.cache[supabasePath] = {
      id: supabasePath,
      filename: supabasePath,
      loaded: true,
      exports: {
        getSupabase: vi.fn(() => null),
        reconfigure: vi.fn(),
      },
    };

    bridge = require_(bridgePath);

    mainWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: { send: vi.fn() },
    };
    bridge.init(mainWindow);
  });

  afterEach(() => {
    if (bridge) {
      bridge.shouldReconnect = false;
      if (bridge._reconnectTimer) {
        clearTimeout(bridge._reconnectTimer);
        bridge._reconnectTimer = null;
      }
      if (bridge._challengeTimer) {
        clearTimeout(bridge._challengeTimer);
        bridge._challengeTimer = null;
      }
      while (bridge._handshakeWaiters?.length) {
        const w = bridge._handshakeWaiters.shift();
        clearTimeout(w.timer);
      }
      bridge._stopTick();
    }
    delete require_.cache[wsPath];
    delete require_.cache[supabasePath];
    vi.useRealTimers();
  });

  // ===========================================================================
  // Protocol v3: challenge-response handshake
  // ===========================================================================

  it("waits for challenge before sending connect frame", () => {
    bridge.connect("ws://localhost:18789");
    const ws = bridge.ws;
    ws._emit("open");

    // Should NOT have sent a connect frame yet (waiting for challenge)
    expect(ws.send).not.toHaveBeenCalled();
    expect(bridge.isConnected).toBe(false);
  });

  it("handles v3 challenge and sends full connect request", () => {
    bridge.connect("ws://localhost:18789");
    const ws = bridge.ws;
    ws._emit("open");

    // Gateway sends challenge
    const challenge = {
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "test-nonce-123", ts: Date.now(), protocols: [3] },
    };
    ws._emit("message", JSON.stringify(challenge));

    // Bridge should have sent a v3 connect request
    expect(ws.send).toHaveBeenCalledTimes(1);
    const sentFrame = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentFrame.type).toBe("req");
    expect(sentFrame.method).toBe("connect");
    expect(sentFrame.params.minProtocol).toBe(3);
    expect(sentFrame.params.maxProtocol).toBe(3);
    expect(sentFrame.params.nonce).toBe("test-nonce-123");
    expect(sentFrame.params.role).toBe("operator");
    expect(sentFrame.params.client.id).toBe("hivemind-os");
  });

  it("completes handshake on hello-ok response", () => {
    bridge.connect("ws://localhost:18789");
    const ws = bridge.ws;
    ws._emit("open");

    // Send challenge
    ws._emit(
      "message",
      JSON.stringify({
        type: "event",
        event: "connect.challenge",
        payload: { nonce: "nonce-1" },
      }),
    );

    const connectFrame = JSON.parse(ws.send.mock.calls[0][0]);

    // Gateway responds with hello-ok
    ws._emit(
      "message",
      JSON.stringify({
        type: "res",
        id: connectFrame.id,
        ok: true,
        payload: {
          type: "hello-ok",
          protocol: 3,
          policy: { tickIntervalMs: 15000 },
        },
      }),
    );

    expect(bridge.isConnected).toBe(true);
    expect(bridge._protocolVersion).toBe(3);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      "gateway:connected",
      expect.objectContaining({ protocol: 3 }),
    );
  });

  it("waitUntilHandshake resolves after v3 hello-ok", async () => {
    bridge.connect("ws://localhost:18789");
    const ws = bridge.ws;
    ws._emit("open");

    const waitP = bridge.waitUntilHandshake(5000);

    ws._emit(
      "message",
      JSON.stringify({
        type: "event",
        event: "connect.challenge",
        payload: { nonce: "n1" },
      }),
    );

    const connectFrame = JSON.parse(ws.send.mock.calls[0][0]);
    ws._emit(
      "message",
      JSON.stringify({
        type: "res",
        id: connectFrame.id,
        ok: true,
        payload: {
          type: "hello-ok",
          protocol: 3,
          policy: { tickIntervalMs: 15000 },
        },
      }),
    );

    await expect(waitP).resolves.toBeUndefined();
  });

  it("waitUntilHandshake rejects when handshake times out", async () => {
    bridge.connect("ws://localhost:18789");
    const ws = bridge.ws;
    ws._emit("open");

    const waitP = bridge.waitUntilHandshake(800);
    vi.advanceTimersByTime(801);

    await expect(waitP).rejects.toThrow(/timed out/);
  });

  // ===========================================================================
  // Protocol v1.0: fallback when no challenge arrives
  // ===========================================================================

  it("falls back to v1.0 when no challenge arrives within timeout", () => {
    bridge.connect("ws://localhost:18789");
    const ws = bridge.ws;
    ws._emit("open");

    expect(ws.send).not.toHaveBeenCalled();

    // Advance past the challenge timeout (3s)
    vi.advanceTimersByTime(8001);

    // Should have sent a v1.0 connect frame
    expect(ws.send).toHaveBeenCalledTimes(1);
    const sentFrame = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentFrame.method).toBe("connect");
    expect(sentFrame.params.version).toBe("1.0");
    expect(bridge._protocolVersion).toBe(1);
    expect(bridge.isConnected).toBe(true);
  });

  // ===========================================================================
  // Tick keepalive
  // ===========================================================================

  it("responds to tick events with pong", () => {
    bridge.connect("ws://localhost:18789");
    const ws = bridge.ws;
    ws._emit("open");

    // Fast-track to connected via v1.0 fallback
    vi.advanceTimersByTime(8001);
    ws.send.mockClear();

    // Gateway sends a tick event
    ws._emit(
      "message",
      JSON.stringify({
        type: "event",
        event: "tick",
        payload: { timestamp: Date.now() },
        seq: 42,
      }),
    );

    // Bridge should respond with tick.pong
    expect(ws.send).toHaveBeenCalledTimes(1);
    const pong = JSON.parse(ws.send.mock.calls[0][0]);
    expect(pong.event).toBe("tick.pong");
    expect(pong.payload.seq).toBe(42);

    // Tick events should NOT be forwarded to renderer
    expect(mainWindow.webContents.send).not.toHaveBeenCalledWith(
      "gateway:event",
      expect.objectContaining({ event: "tick" }),
    );
  });

  // ===========================================================================
  // Request/response
  // ===========================================================================

  it("resolves pending request on response", async () => {
    bridge.connect("ws://localhost:18789");
    const ws = bridge.ws;
    ws._emit("open");
    vi.advanceTimersByTime(8001); // v1.0 fallback

    const requestPromise = bridge.request("agent.list", { filter: "all" });

    const reqFrame = JSON.parse(
      ws.send.mock.calls[ws.send.mock.calls.length - 1][0],
    );

    ws._emit(
      "message",
      JSON.stringify({
        type: "res",
        id: reqFrame.id,
        ok: true,
        payload: { agents: ["a1", "a2"] },
      }),
    );

    const result = await requestPromise;
    expect(result).toEqual({ agents: ["a1", "a2"] });
  });

  it("rejects pending request on timeout", async () => {
    bridge.connect("ws://localhost:18789");
    const ws = bridge.ws;
    ws._emit("open");
    vi.advanceTimersByTime(8001);

    const requestPromise = bridge.request("agent.list", {}, 5000);
    vi.advanceTimersByTime(5001);

    await expect(requestPromise).rejects.toThrow("Request timeout");
  });

  // ===========================================================================
  // Event forwarding
  // ===========================================================================

  it("forwards events to renderer", () => {
    bridge.connect("ws://localhost:18789");
    const ws = bridge.ws;
    ws._emit("open");
    vi.advanceTimersByTime(8001);

    const eventFrame = {
      type: "event",
      event: "health",
      payload: { status: "ok" },
    };
    ws._emit("message", JSON.stringify(eventFrame));

    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      "gateway:event",
      eventFrame,
    );
  });

  it("handles security checkpoint events", () => {
    bridge.connect("ws://localhost:18789");
    const ws = bridge.ws;
    ws._emit("open");
    vi.advanceTimersByTime(8001);

    const checkpointPayload = {
      type: "security_checkpoint",
      agentId: "coder",
      action: "file_write",
    };
    ws._emit(
      "message",
      JSON.stringify({
        type: "event",
        event: "agent",
        payload: checkpointPayload,
      }),
    );

    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      "security:checkpoint",
      checkpointPayload,
    );
  });

  it("forwards task lifecycle events", () => {
    bridge.connect("ws://localhost:18789");
    const ws = bridge.ws;
    ws._emit("open");
    vi.advanceTimersByTime(8001);

    ws._emit(
      "message",
      JSON.stringify({
        type: "event",
        event: "task",
        payload: { status: "started", taskId: "t1" },
      }),
    );

    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      "task:started",
      expect.objectContaining({ taskId: "t1" }),
    );
  });

  // ===========================================================================
  // Reconnection
  // ===========================================================================

  it("reconnects on close", () => {
    bridge.connect("ws://localhost:18789");
    const ws = bridge.ws;
    ws._emit("open");
    vi.advanceTimersByTime(8001);

    expect(bridge.isConnected).toBe(true);

    ws._emit("close", 1006, "");
    expect(bridge.isConnected).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(MockWebSocket._instances.length).toBeGreaterThan(1);
  });

  it("replaces prior reconnect timer when scheduling again (no orphan timers)", () => {
    bridge.shouldReconnect = true;
    bridge._url = "ws://localhost:18789";
    bridge.reconnectDelay = 1000;

    bridge._scheduleReconnect();
    bridge._scheduleReconnect();

    // First timer was cleared; nothing should run at the first delay
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket._instances.length).toBe(0);

    // Second timer used updated backoff (2000ms from first _scheduleReconnect)
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket._instances.length).toBe(1);
  });

  it("stops reconnecting after disconnect()", () => {
    bridge.connect("ws://localhost:18789");
    const ws = bridge.ws;
    ws._emit("open");
    vi.advanceTimersByTime(8001);

    bridge.disconnect();

    expect(bridge.shouldReconnect).toBe(false);
    expect(bridge.isConnected).toBe(false);
    expect(bridge.ws).toBeNull();

    const count = MockWebSocket._instances.length;
    vi.advanceTimersByTime(60000);
    expect(MockWebSocket._instances.length).toBe(count);
  });

  it("cleans up tick and challenge timers on disconnect", () => {
    bridge.connect("ws://localhost:18789");
    const ws = bridge.ws;
    ws._emit("open");

    // Bridge has a challenge timer running
    expect(bridge._challengeTimer).not.toBeNull();

    bridge.disconnect();

    expect(bridge._challengeTimer).toBeNull();
    expect(bridge._tickInterval).toBeNull();
  });
});
