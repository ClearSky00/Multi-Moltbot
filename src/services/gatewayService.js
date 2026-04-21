/**
 * Gateway Service — renderer-side connection state tracker.
 *
 * This is NOT a direct WebSocket client (the WebSocket lives in the main
 * process via electron/ipc/gatewayBridge.js). This service listens to
 * gateway events forwarded via window.hivemind.on() and provides a
 * reactive state object for the UI layer.
 */

const GATEWAY_STATUS = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  ERROR: "error",
};

class GatewayService {
  constructor() {
    this.status = GATEWAY_STATUS.DISCONNECTED;
    this.error = null;
    this.connectedAt = null;
    this.disconnectedAt = null;
    this.reconnectCount = 0;
    this._listeners = new Set();
    this._cleanups = [];
    this._initialized = false;
  }

  /**
   * Initialize event listeners. Call once when the app boots.
   * Returns a cleanup function to tear down all listeners.
   */
  init() {
    if (this._initialized) return () => {};
    this._initialized = true;

    const cleanupConnected = window.hivemind.on("gateway:connected", (data) => {
      this.status = GATEWAY_STATUS.CONNECTED;
      this.error = null;
      this.connectedAt = Date.now();
      this.reconnectCount = 0;
      this._notify({ type: "connected", data });
    });

    const cleanupDisconnected = window.hivemind.on(
      "gateway:disconnected",
      (data) => {
        this.status = GATEWAY_STATUS.DISCONNECTED;
        this.disconnectedAt = Date.now();
        this.reconnectCount += 1;
        this._notify({ type: "disconnected", data });
      },
    );

    const cleanupError = window.hivemind.on("gateway:error", (data) => {
      this.status = GATEWAY_STATUS.ERROR;
      this.error = data?.message || "Unknown gateway error";
      this._notify({ type: "error", data });
    });

    this._cleanups = [cleanupConnected, cleanupDisconnected, cleanupError];

    return () => this.destroy();
  }

  /**
   * Tear down all event listeners.
   */
  destroy() {
    for (const cleanup of this._cleanups) {
      if (typeof cleanup === "function") {
        cleanup();
      }
    }
    this._cleanups = [];
    this._listeners.clear();
    this._initialized = false;
  }

  /**
   * Subscribe to gateway state changes.
   * Returns an unsubscribe function.
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Notify all subscribers of a state change.
   */
  _notify(event) {
    for (const listener of this._listeners) {
      try {
        listener(event, this.getState());
      } catch (err) {
        console.error("[GatewayService] Listener error:", err);
      }
    }
  }

  /**
   * Get a snapshot of the current gateway state.
   */
  getState() {
    return {
      status: this.status,
      error: this.error,
      connectedAt: this.connectedAt,
      disconnectedAt: this.disconnectedAt,
      reconnectCount: this.reconnectCount,
      isConnected: this.status === GATEWAY_STATUS.CONNECTED,
    };
  }

  /**
   * Request the gateway to connect (delegates to main process).
   */
  async connect(url) {
    this.status = GATEWAY_STATUS.CONNECTING;
    this._notify({ type: "connecting" });
    return window.hivemind.invoke("gateway:connect", { url });
  }

  /**
   * Request the gateway to disconnect.
   */
  async disconnect() {
    return window.hivemind.invoke("gateway:disconnect");
  }

  /**
   * Fetch the current gateway status from the main process.
   */
  async fetchStatus() {
    try {
      const result = await window.hivemind.invoke("gateway:status");
      if (result?.connected) {
        this.status = GATEWAY_STATUS.CONNECTED;
        this.error = null;
      } else {
        this.status = GATEWAY_STATUS.DISCONNECTED;
      }
      this._notify({ type: "status-fetched", data: result });
      return result;
    } catch (err) {
      this.status = GATEWAY_STATUS.ERROR;
      this.error = err.message;
      this._notify({ type: "error", data: { message: err.message } });
      return null;
    }
  }
}

export { GATEWAY_STATUS };
export const gatewayService = new GatewayService();
export default gatewayService;
