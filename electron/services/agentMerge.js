"use strict";

/**
 * agentMerge.js — Fetch agents from Supabase and overlay per-user model
 * preferences from user_agent_preferences.
 *
 * Returns agents where `model` is the user's override (if set) or the base
 * model from the agents table. The original model is preserved in `_baseModel`
 * for display purposes.
 */

const { getSupabase, getUserId } = require("./supabase");

/**
 * Fetch all agents merged with the current user's model preferences.
 *
 * @returns {Promise<object[]>} Agent records with per-user model applied
 */
async function fetchMergedAgents() {
  const supabase = getSupabase();
  if (!supabase) return [];

  // Fetch agents and user prefs in parallel
  const [agentsResult, prefsResult] = await Promise.all([
    supabase.from("agents").select("*"),
    supabase.from("user_agent_preferences").select("agent_id, model"),
  ]);

  if (agentsResult.error) {
    console.error("[agentMerge] Failed to fetch agents:", agentsResult.error.message);
    return [];
  }

  const agents = agentsResult.data || [];

  // Build a lookup map of agentId -> user model override
  const prefMap = {};
  if (!prefsResult.error && prefsResult.data) {
    for (const pref of prefsResult.data) {
      if (pref.model) {
        prefMap[pref.agent_id] = pref.model;
      }
    }
  }

  // Merge: apply user model override where present
  return agents.map((agent) => {
    const userModel = prefMap[agent.id];
    if (userModel && userModel !== agent.model) {
      return { ...agent, _baseModel: agent.model, model: userModel };
    }
    return { ...agent, _baseModel: agent.model };
  });
}

module.exports = { fetchMergedAgents };
