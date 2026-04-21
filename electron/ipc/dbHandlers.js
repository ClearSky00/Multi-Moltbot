"use strict";

const { ipcMain } = require("electron");
const {
  getSupabase,
  safeInsert,
  safeUpsert,
  stripUserId,
} = require("../services/supabase");
const requireAuth = require("./requireAuth");
const gatewayBridge = require("./gatewayBridge");

module.exports = function registerDbHandlers() {
  // ---------------------------------------------------------------------------
  // AGENTS
  // ---------------------------------------------------------------------------

  ipcMain.handle("db:agents:list", async () => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .order("is_preset", { ascending: false })
      .order("name", { ascending: true });

    if (error) return { error: error.message };
    return { data };
  });

  ipcMain.handle("db:agents:get", async (_event, { id }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return { error: error.message };
    return { data };
  });

  ipcMain.handle("db:agents:upsert", async (_event, { agent }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const record = {
      ...agent,
      updated_at: new Date().toISOString(),
      user_id: agent.user_id || auth.userId,
    };

    const { data, error } = await safeUpsert(supabase, "agents", record, {
      onConflict: "id",
    });

    if (error) return { error: error.message };
    return { data };
  });

  ipcMain.handle("db:agents:delete", async (_event, { id }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    // Safety: never delete preset agents
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
    return { data: { deleted: true, id } };
  });

  // ---------------------------------------------------------------------------
  // TASKS
  // ---------------------------------------------------------------------------

  ipcMain.handle("db:tasks:list", async (_event, { limit, offset } = {}) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    let query = supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });

    if (typeof limit === "number" && limit > 0) {
      query = query.limit(limit);
    }
    if (typeof offset === "number" && offset > 0) {
      query = query.range(offset, offset + (limit || 50) - 1);
    }

    const { data, error } = await query;
    if (error) return { error: error.message };
    return { data };
  });

  ipcMain.handle("db:tasks:create", async (_event, { task }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const record = {
      ...task,
      created_at: task.created_at || new Date().toISOString(),
      status: task.status || "pending",
      user_id: task.user_id || auth.userId,
    };

    const { data, error } = await safeInsert(supabase, "tasks", record);

    if (error) return { error: error.message };
    return { data };
  });

  ipcMain.handle("db:tasks:update", async (_event, { id, updates }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const { data, error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return { error: error.message };
    return { data };
  });

  ipcMain.handle("db:tasks:delete", async (_event, payload = {}) => {
    const rawId = payload?.id;
    const id =
      typeof rawId === "string" ? rawId.trim() : String(rawId ?? "").trim();
    if (!id) return { error: "id is required" };

    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const { data: row, error: fetchErr } = await supabase
      .from("tasks")
      .select("status")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) return { error: fetchErr.message };
    // No Supabase row (insert failed, RLS drift, or UI-only task from gateway) — still let the user clear the card.
    if (!row) {
      if (gatewayBridge.isConnected) {
        gatewayBridge.request("task.cancel", { taskId: id }).catch((err) => {
          console.error(
            "[dbHandlers] task.cancel (no DB row) failed:",
            err.message,
          );
        });
      }
      return { data: { deleted: true, id, localOnly: true } };
    }

    const status = String(row.status || "").toLowerCase();
    const removableTerminal = new Set(["failed", "completed", "cancelled"]);
    const active = new Set(["pending", "running"]);

    if (active.has(status)) {
      if (gatewayBridge.isConnected) {
        gatewayBridge.request("task.cancel", { taskId: id }).catch((err) => {
          console.error(
            "[dbHandlers] task.cancel before delete failed:",
            err.message,
          );
        });
      }
    } else if (!removableTerminal.has(status)) {
      return { error: "This task cannot be removed from history." };
    }

    const { data: deletedRows, error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) return { error: error.message };
    if (!deletedRows || deletedRows.length === 0) {
      return {
        error:
          "Task could not be deleted. It may belong to another account or RLS blocked the operation.",
      };
    }
    return { data: { deleted: true, id } };
  });

  // ---------------------------------------------------------------------------
  // AUDIT LOG — append-only, NEVER update or delete
  // ---------------------------------------------------------------------------

  ipcMain.handle("db:audit:append", async (_event, { entry }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const record = {
      ...entry,
      created_at: new Date().toISOString(),
      user_id: entry.user_id || auth.userId,
    };

    const { data, error } = await safeInsert(supabase, "audit_log", record);

    if (error) return { error: error.message };
    return { data };
  });

  ipcMain.handle(
    "db:audit:list",
    async (_event, { limit, agentId, actionType } = {}) => {
      const supabase = getSupabase();
      if (!supabase) return { error: "Supabase not configured" };

      const auth = requireAuth();
      if (auth.error) return { error: auth.error };

      let query = supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false });

      if (agentId) {
        query = query.eq("agent_id", agentId);
      }
      if (actionType) {
        query = query.eq("event_type", actionType);
      }
      if (typeof limit === "number" && limit > 0) {
        query = query.limit(limit);
      } else {
        query = query.limit(200);
      }

      const { data, error } = await query;
      if (error) return { error: error.message };
      return { data };
    },
  );

  // ---------------------------------------------------------------------------
  // CHECKPOINTS
  // ---------------------------------------------------------------------------

  ipcMain.handle("db:checkpoints:create", async (_event, { checkpoint }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const record = {
      ...checkpoint,
      created_at: new Date().toISOString(),
      user_id: checkpoint.user_id || auth.userId,
    };

    const { data, error } = await safeInsert(supabase, "checkpoints", record);

    if (error) return { error: error.message };
    return { data };
  });

  ipcMain.handle("db:checkpoints:resolve", async (_event, { id, decision }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const { data, error } = await supabase
      .from("checkpoints")
      .update({
        decision,
        decided_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) return { error: error.message };
    return { data };
  });

  // ---------------------------------------------------------------------------
  // SKILLS
  // ---------------------------------------------------------------------------

  ipcMain.handle("db:skills:list", async (_event, { agentId } = {}) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    let query = supabase
      .from("skills")
      .select("*")
      .order("name", { ascending: true });

    if (agentId) {
      query = query.eq("agent_id", agentId);
    }

    const { data, error } = await query;
    if (error) return { error: error.message };
    return { data };
  });

  ipcMain.handle("db:skills:upsert", async (_event, { skill }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const record = {
      ...skill,
      user_id: skill.user_id || auth.userId,
    };

    const { data, error } = await safeUpsert(supabase, "skills", record, {
      onConflict: "id",
    });

    if (error) return { error: error.message };
    return { data };
  });

  ipcMain.handle("db:skills:delete", async (_event, { id }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const { error } = await supabase.from("skills").delete().eq("id", id);

    if (error) return { error: error.message };
    return { data: { deleted: true, id } };
  });

  // ---------------------------------------------------------------------------
  // USER SETTINGS (key-value store)
  // ---------------------------------------------------------------------------

  ipcMain.handle("db:settings:get", async (_event, { key }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    // Try user-scoped query first; fall back to key-only if user_id column is missing
    let query = supabase.from("user_settings").select("*").eq("key", key);

    const scoped = await query.eq("user_id", auth.userId).single();

    if (
      scoped.error &&
      scoped.error.message &&
      scoped.error.message.includes("schema cache")
    ) {
      // user_id column doesn't exist — query by key only
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("key", key)
        .maybeSingle();
      if (error && error.code !== "PGRST116") return { error: error.message };
      return { data: data || null };
    }

    if (scoped.error && scoped.error.code !== "PGRST116") {
      return { error: scoped.error.message };
    }
    return { data: scoped.data || null };
  });

  ipcMain.handle("db:settings:set", async (_event, { key, value }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const record = {
      key,
      value,
      updated_at: new Date().toISOString(),
      user_id: auth.userId,
    };

    // Try user-scoped upsert; fall back if user_id column is missing
    const { data, error } = await safeUpsert(
      supabase,
      "user_settings",
      record,
      { onConflict: "key,user_id" },
    );

    // If the composite constraint doesn't exist either, try key-only
    if (
      error &&
      (error.message.includes("user_id") ||
        error.message.includes("constraint"))
    ) {
      const { user_id, ...rest } = record;
      const fallback = await supabase
        .from("user_settings")
        .upsert(rest, { onConflict: "key" })
        .select()
        .maybeSingle();
      if (fallback.error) return { error: fallback.error.message };
      return { data: fallback.data };
    }

    if (error) return { error: error.message };
    return { data };
  });

  // ---------------------------------------------------------------------------
  // BUILDS
  // ---------------------------------------------------------------------------

  ipcMain.handle(
    "db:builds:list",
    async (_event, { limit, offset, status: filterStatus } = {}) => {
      const supabase = getSupabase();
      if (!supabase) return { error: "Supabase not configured" };

      const auth = requireAuth();
      if (auth.error) return { error: auth.error };

      let query = supabase
        .from("builds")
        .select("*")
        .order("created_at", { ascending: false });

      if (filterStatus) {
        query = query.eq("status", filterStatus);
      }
      if (typeof limit === "number" && limit > 0) {
        query = query.limit(limit);
      }
      if (typeof offset === "number" && offset > 0) {
        query = query.range(offset, offset + (limit || 50) - 1);
      }

      const { data, error } = await query;
      if (error) return { error: error.message };
      return { data };
    },
  );

  ipcMain.handle("db:builds:get", async (_event, { id }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const { data, error } = await supabase
      .from("builds")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return { error: error.message };
    return { data };
  });

  ipcMain.handle("db:builds:create", async (_event, { build }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const record = {
      ...build,
      created_at: build.created_at || new Date().toISOString(),
      status: build.status || "pending",
      user_id: build.user_id || auth.userId,
    };

    const { data, error } = await safeInsert(supabase, "builds", record);

    if (error) return { error: error.message };
    return { data };
  });

  ipcMain.handle("db:builds:update", async (_event, { id, updates }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const { data, error } = await supabase
      .from("builds")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return { error: error.message };
    return { data };
  });

  ipcMain.handle("db:builds:delete", async (_event, payload = {}) => {
    const rawId = payload?.id;
    const id =
      typeof rawId === "string" ? rawId.trim() : String(rawId ?? "").trim();
    if (!id) return { error: "id is required" };

    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const { data: deletedRows, error } = await supabase
      .from("builds")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) return { error: error.message };
    if (!deletedRows || deletedRows.length === 0) {
      return {
        error:
          "Build could not be deleted. It may belong to another account or RLS blocked the operation.",
      };
    }
    return { data: { deleted: true, id } };
  });

  // ── Agent preferences ────────────────────────────────────────────────────────

  ipcMain.handle("db:agent-prefs:list", async () => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const { data, error } = await supabase
      .from("user_agent_preferences")
      .select("*");

    if (error) return { error: error.message };
    return { data };
  });

  ipcMain.handle("db:agent-prefs:set", async (_event, { agentId, model }) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Supabase not configured" };

    const auth = requireAuth();
    if (auth.error) return { error: auth.error };

    const record = {
      user_id: auth.userId,
      agent_id: agentId,
      model,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await safeUpsert(
      supabase,
      "user_agent_preferences",
      record,
      { onConflict: "user_id,agent_id" },
    );

    if (error) return { error: error.message };
    return { data };
  });
};
