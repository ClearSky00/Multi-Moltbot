"use strict";

const { ipcMain } = require("electron");
const gatewayBridge = require("./gatewayBridge");
const { getSupabase, getUserId } = require("../services/supabase");
const requireAuth = require("./requireAuth");
const { writeConfig } = require("../services/openclawConfig");
const { writeProviderCredentials } = require("../services/providerCredentials");
const { ensureWorkspace } = require("../services/workspaceManager");
const { fetchMergedAgents } = require("../services/agentMerge");

/**
 * Regenerate openclaw.json from the current agents table merged with user prefs.
 * Called after any agent create/update/delete operation, or after a pref change.
 */
async function regenerateConfig() {
  try {
    const agents = await fetchMergedAgents();
    if (agents.length > 0) {
      await writeConfig(agents);
      await writeProviderCredentials();
    }
  } catch (err) {
    console.error(
      "[agentHandlers] Failed to regenerate openclaw.json:",
      err.message,
    );
  }
}

/**
 * Register all agent:* IPC handlers.
 * Agent operations involve both the Gateway (runtime state) and Supabase (persistence).
 * @param {Electron.BrowserWindow} mainWindow
 */
module.exports = function registerAgentHandlers(mainWindow) {
  // ---------------------------------------------------------------------------
  // agent:list — Fetches the list of all agents from the Gateway.
  // Falls back to Supabase if the Gateway is not connected.
  // ---------------------------------------------------------------------------
  ipcMain.handle("agent:list", async () => {
    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    // Try the gateway first for live runtime state
    if (gatewayBridge.isConnected) {
      try {
        const result = await gatewayBridge.request("agent.list", {});
        return { data: result };
      } catch (err) {
        // Gateway failed — fall through to Supabase
      }
    }

    // Fallback: read persisted agent definitions from database
    const supabase = getSupabase();
    if (!supabase) {
      return {
        data: [],
        error: "Gateway disconnected and Supabase not configured",
      };
    }

    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .order("is_preset", { ascending: false })
      .order("name", { ascending: true });

    if (error) return { data: [], error: error.message };
    return { data };
  });

  // ---------------------------------------------------------------------------
  // agent:get — Get a single agent by ID from the Gateway or Supabase.
  // ---------------------------------------------------------------------------
  ipcMain.handle("agent:get", async (_event, { id }) => {
    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    if (gatewayBridge.isConnected) {
      try {
        const result = await gatewayBridge.request("agent.get", {
          agentId: id,
        });
        return { data: result };
      } catch (err) {
        // Fall through
      }
    }

    const supabase = getSupabase();
    if (!supabase)
      return { error: "Gateway disconnected and Supabase not configured" };

    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return { error: error.message };
    return { data };
  });

  // ---------------------------------------------------------------------------
  // agent:create — Persist a new agent definition to Supabase and notify Gateway.
  // ---------------------------------------------------------------------------
  ipcMain.handle("agent:create", async (_event, { agent }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const record = {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      model: agent.model || "gemini/gemini-2.0-flash",
      is_preset: false,
      soul_content: agent.soul_content || agent.soulContent || "",
      agents_content: agent.agents_content || agent.agentsContent || "",
      tools_allow: agent.tools_allow || agent.toolsAllow || [],
      tools_deny: agent.tools_deny || agent.toolsDeny || [],
      sandbox_mode: agent.sandbox_mode || agent.sandboxMode || "all",
      workspace: agent.workspace || `~/.openclaw/workspace-${agent.id}`,
      user_id: auth.userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("agents")
      .insert(record)
      .select()
      .single();

    if (error) return { error: error.message };

    // Create workspace for the new agent
    try {
      await ensureWorkspace(agent.id, record);
    } catch (err) {
      console.error("[agentHandlers] Failed to create workspace:", err.message);
    }

    // Regenerate openclaw.json with the new agent
    await regenerateConfig();

    // Notify the Gateway about the new agent so it can be hot-loaded
    if (gatewayBridge.isConnected) {
      try {
        await gatewayBridge.request("agent.register", {
          agentId: agent.id,
          config: record,
        });
      } catch (err) {
        // Non-fatal: the agent is persisted, gateway can pick it up on restart
        console.error(
          "[agentHandlers] Failed to register agent with gateway:",
          err.message,
        );
      }
    }

    return { data };
  });

  // ---------------------------------------------------------------------------
  // agent:update — Update an existing agent definition in Supabase.
  // ---------------------------------------------------------------------------
  ipcMain.handle("agent:update", async (_event, { id, updates }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const record = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("agents")
      .update(record)
      .eq("id", id)
      .select()
      .single();

    if (error) return { error: error.message };

    // Regenerate openclaw.json with updated agent config
    await regenerateConfig();

    // Notify gateway of the configuration change
    if (gatewayBridge.isConnected) {
      try {
        await gatewayBridge.request("agent.update_config", {
          agentId: id,
          config: record,
        });
      } catch (err) {
        console.error(
          "[agentHandlers] Failed to push config update to gateway:",
          err.message,
        );
      }
    }

    return { data };
  });

  // ---------------------------------------------------------------------------
  // agent:delete — Delete a custom agent. Preset agents cannot be deleted.
  // ---------------------------------------------------------------------------
  ipcMain.handle("agent:delete", async (_event, { id }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    // Safety: verify the agent is not a preset
    const { data: existing, error: fetchError } = await supabase
      .from("agents")
      .select("is_preset")
      .eq("id", id)
      .single();

    if (fetchError) return { error: fetchError.message };
    if (existing && existing.is_preset) {
      return { error: "Cannot delete a preset agent" };
    }

    const { error } = await supabase
      .from("agents")
      .delete()
      .eq("id", id)
      .eq("is_preset", false);

    if (error) return { error: error.message };

    // Regenerate openclaw.json without the deleted agent
    await regenerateConfig();

    // Tell the gateway to unregister the agent
    if (gatewayBridge.isConnected) {
      try {
        await gatewayBridge.request("agent.unregister", { agentId: id });
      } catch (err) {
        console.error(
          "[agentHandlers] Failed to unregister agent from gateway:",
          err.message,
        );
      }
    }

    return { data: { deleted: true, id } };
  });

  // ---------------------------------------------------------------------------
  // agent:refresh-config — Regenerate openclaw.json from current agents + prefs.
  // ---------------------------------------------------------------------------
  ipcMain.handle("agent:refresh-config", async () => {
    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    await regenerateConfig();
    return { data: { refreshed: true } };
  });

  // ---------------------------------------------------------------------------
  // agent:start — Tell the Gateway to start (activate) an agent session.
  // ---------------------------------------------------------------------------
  ipcMain.handle("agent:start", async (_event, { id }) => {
    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    if (!gatewayBridge.isConnected) {
      return { error: "Gateway not connected" };
    }

    try {
      const result = await gatewayBridge.request("agent.start", {
        agentId: id,
      });

      // Log the start event
      const supabase = getSupabase();
      if (supabase) {
        await supabase.from("audit_log").insert({
          agent_id: id,
          event_type: "agent_started",
          payload: { agentId: id },
          user_id: auth.userId,
          created_at: new Date().toISOString(),
        });
      }

      return { data: result };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // agent:stop — Tell the Gateway to stop an agent session gracefully.
  // ---------------------------------------------------------------------------
  ipcMain.handle("agent:stop", async (_event, { id }) => {
    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    if (!gatewayBridge.isConnected) {
      return { error: "Gateway not connected" };
    }

    try {
      const result = await gatewayBridge.request("agent.stop", { agentId: id });

      const supabase = getSupabase();
      if (supabase) {
        await supabase.from("audit_log").insert({
          agent_id: id,
          event_type: "agent_stopped",
          payload: { agentId: id },
          user_id: auth.userId,
          created_at: new Date().toISOString(),
        });
      }

      return { data: result };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // agent:restart — Stop then start an agent via the Gateway.
  // ---------------------------------------------------------------------------
  ipcMain.handle("agent:restart", async (_event, { id }) => {
    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    if (!gatewayBridge.isConnected) {
      return { error: "Gateway not connected" };
    }

    try {
      // Stop first
      await gatewayBridge.request("agent.stop", { agentId: id });
      // Brief pause to allow clean shutdown
      await new Promise((resolve) => setTimeout(resolve, 500));
      // Start again
      const result = await gatewayBridge.request("agent.start", {
        agentId: id,
      });

      const supabase = getSupabase();
      if (supabase) {
        await supabase.from("audit_log").insert({
          agent_id: id,
          event_type: "agent_restarted",
          payload: { agentId: id },
          user_id: auth.userId,
          created_at: new Date().toISOString(),
        });
      }

      return { data: result };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ---------------------------------------------------------------------------
  // agent:open-workspace — Open the agent's workspace directory in the OS file manager.
  // ---------------------------------------------------------------------------
  ipcMain.handle("agent:open-workspace", async (_event, { agentId }) => {
    if (!agentId) return { error: "agentId is required" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const { shell } = require("electron");
    const { getWorkspacePath } = require("../services/pathUtils");
    const workspacePath = getWorkspacePath(agentId);

    const errorStr = await shell.openPath(workspacePath);
    if (errorStr) return { error: errorStr };
    return { data: { opened: true, path: workspacePath } };
  });
};
