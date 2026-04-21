'use strict';

const { generateText } = require('./geminiService');
const { getSupabase } = require('./supabase');

/**
 * Fetch the list of available agents (excluding the orchestrator) from Supabase.
 * Falls back to the preset agent roster if Supabase is unavailable.
 */
async function getAvailableAgents() {
  const PRESET_AGENTS = [
    { id: 'pm',        name: 'PM',         role: 'Planning & requirements — creates project plans, user stories, timelines, and requirements documents' },
    { id: 'coder',     name: 'Coder',      role: 'Engineering — implements code, builds features, writes scripts, sets up infrastructure' },
    { id: 'qa',        name: 'QA',         role: 'Testing — writes and runs tests, QA plans, bug reports, cross-browser/device testing' },
    { id: 'cybersec',  name: 'CyberSec',   role: 'Security audit — vulnerability assessment, security review, penetration testing, compliance' },
    { id: 'design',    name: 'Design',     role: 'UI/UX — wireframes, mockups, visual design, design systems, user experience' },
    { id: 'marketing', name: 'Marketing',  role: 'Copywriting & growth — content creation, SEO, promotional copy, brand voice, social media' },
    { id: 'research',  name: 'Research',   role: 'Intelligence — market research, competitive analysis, technology research, data gathering' },
    { id: 'patrol',    name: 'Patrol',     role: 'Watchdog — monitoring, anomaly detection, system health checks, incident response' },
  ];

  const supabase = getSupabase();
  if (!supabase) return PRESET_AGENTS;

  try {
    const { data: agents, error } = await supabase
      .from('agents')
      .select('id, name, role')
      .neq('id', 'orchestrator');

    if (error || !agents || agents.length === 0) return PRESET_AGENTS;
    return agents;
  } catch {
    return PRESET_AGENTS;
  }
}

/**
 * Build the system prompt for goal expansion.
 */
function buildExpansionPrompt(goal, agents) {
  const agentList = agents
    .map(a => `- **${a.id}** (${a.name}): ${a.role}`)
    .join('\n');

  return `You are a strategic mission planner for a team of autonomous AI agents. Your job is to take a user's high-level goal and produce a detailed, structured delegation plan.

## Available Agents
${agentList}

## Your Task
Given the user's goal below, analyze it and produce DELEGATE directives for EVERY agent that should be involved. Each directive must be a detailed, comprehensive brief — not a vague one-liner.

## Rules
1. ONLY delegate to agents from the list above whose role is genuinely relevant to the goal. Not every goal needs every agent.
2. Each DELEGATE directive MUST include:
   - A clear description of what the agent should produce
   - Specific deliverables or outputs expected
   - Key considerations, constraints, or requirements
   - How this agent's work relates to the other agents' work
3. The orchestrator is NOT in the list — you are acting as the planning layer for the orchestrator.
4. Write each directive as a SINGLE line starting with DELEGATE(agentId): followed by the full instruction.
5. Do NOT include any other text, headers, or commentary — ONLY the DELEGATE lines.
6. Each DELEGATE instruction should be 2-5 sentences of substantive detail.
7. If the goal is trivially simple (e.g. "what time is it"), still delegate to the most relevant agent with a clear instruction.

## User's Goal
${goal}

## Output Format (one DELEGATE per line, nothing else)
DELEGATE(agentId): Detailed instruction here...`;
}

/**
 * Expand a raw user goal into detailed per-agent DELEGATE directives using Gemini.
 *
 * @param {string} goal  The user's raw goal text
 * @returns {Promise<string>}  Expanded plan text containing DELEGATE(agentId): directives
 */
async function expandGoal(goal) {
  const agents = await getAvailableAgents();
  const prompt = buildExpansionPrompt(goal, agents);

  const expanded = await generateText(prompt, {
    model: 'gemini-2.0-flash',
    temperature: 0.4,
    maxOutputTokens: 4096,
  });

  const lines = expanded.split('\n').filter(l => l.trim().startsWith('DELEGATE('));
  if (lines.length === 0) {
    console.warn('[goalExpander] Gemini did not produce DELEGATE directives, returning raw output');
    return expanded;
  }

  return lines.join('\n');
}

module.exports = { expandGoal, getAvailableAgents, buildExpansionPrompt };
