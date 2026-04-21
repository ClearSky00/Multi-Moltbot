import { useContext } from "react";
import { GatewayContext } from "../contexts/GatewayContext";

/**
 * useGateway — convenience hook to consume the GatewayContext.
 *
 * Returns { status, error, reconnectGateway } where:
 *   status: 'connected' | 'disconnected' | 'error'
 *   error:  string | null
 *   reconnectGateway: async () => void — IPC connect + wait for handshake
 */
export function useGateway() {
  const context = useContext(GatewayContext);
  if (context === undefined) {
    throw new Error("useGateway must be used within a GatewayProvider");
  }
  return context;
}

export default useGateway;
