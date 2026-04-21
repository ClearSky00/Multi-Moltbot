/**
 * Dashboard / list ordering for preset agents — matches README.md "Agents" table
 * (Orchestrator first, then PM, Coder, QA, …). Custom agents not in this list
 * sort after presets, alphabetically by id.
 */
export const PRESET_AGENT_ORDER = [
  "orchestrator",
  "pm",
  "coder",
  "qa",
  "cybersec",
  "design",
  "marketing",
  "research",
  "patrol",
];

const orderIndex = new Map(PRESET_AGENT_ORDER.map((id, i) => [id, i]));

/**
 * @param {Array<{ id: string, name?: string }>} agents
 * @returns {Array<typeof agents[0]>}
 */
export function sortAgentsByPresetOrder(agents) {
  if (!agents?.length) return [];
  return [...agents].sort((a, b) => {
    const ia = orderIndex.has(a.id)
      ? orderIndex.get(a.id)
      : Number.MAX_SAFE_INTEGER;
    const ib = orderIndex.has(b.id)
      ? orderIndex.get(b.id)
      : Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return String(a.id).localeCompare(String(b.id));
  });
}
