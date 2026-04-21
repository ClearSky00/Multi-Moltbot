"use strict";

/**
 * Orchestrator service — coordinates multi-agent task execution.
 *
 * Flow:
 *  1. Spawn a session for the orchestrator agent to produce a plan.
 *  2. Parse the response:
 *       Format A  →  PLAN + DELEGATE directives (+ optional DEPENDS)
 *       Format B  →  CLARIFY question
 *  3. Write a task.json to each target agent's workspace.
 *  4. Spawn isolated sessions for each delegate agent, respecting DEPENDS ordering.
 *  5. Collect results, spawn a synthesis session on the orchestrator.
 *  6. Persist final result to Supabase and notify the renderer.
 *
 * Agent Communication Protocol (text directives in agent output):
 *  QUERY_AGENT(<agentId>): <question>        — query a peer agent mid-task
 *  NEEDS_CONTEXT_FROM(<agentId>): <desc>     — declare upfront context dependency
 *  NEEDS_WRITE: <description>                — request exclusive file write access
 *
 * These directives trigger up to MAX_DIRECTIVE_ROUNDS re-runs with resolved
 * context injected. Write access is serialized via a per-task WriteMutex.
 * Priority ordering: critical > high > normal > low within each dependency wave.
 */

const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs").promises;
const gatewayBridge = require("../ipc/gatewayBridge");
const { getSupabase, safeInsert, getUserId } = require("./supabase");
const { getOpenClawBase, getWorkspacePath } = require("./pathUtils");
const { detectQuotaError } = require("./quotaDetector");

// =============================================================================
// Quota-aware error class
// =============================================================================

class QuotaExhaustedError extends Error {
  constructor(message, { provider, errorType, partialResults, phase, completedAgents } = {}) {
    super(message);
    this.name = 'QuotaExhaustedError';
    this.provider = provider || null;
    this.errorType = errorType || 'quota_exceeded';
    /** @type {Map<string, string>|null} Partial agent results before quota hit */
    this.partialResults = partialResults || null;
    /** @type {string} Which pipeline phase was active */
    this.phase = phase || 'unknown';
    /** @type {string[]} Agent IDs that completed before the quota error */
    this.completedAgents = completedAgents || [];
  }
}

// =============================================================================
// Active task tracking (for cancellation support)
// =============================================================================

/** @type {Map<string, { buildId: string }>} taskId → { buildId } */
const _activeTasks = new Map();

// =============================================================================
// Task file I/O
// =============================================================================

/**
 * Write a task.json into the agent's workspace directory.
 * @param {string} agentId
 * @param {object} taskData
 */
async function _writeAgentTaskFile(agentId, taskData) {
  const workspacePath = getWorkspacePath(agentId);
  const filePath = path.join(workspacePath, "task.json");
  await fs.mkdir(workspacePath, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(taskData, null, 2), "utf-8");
}

/**
 * Remove the task.json from the agent's workspace after the run completes.
 * Non-fatal — missing file is silently ignored.
 * @param {string} agentId
 */
async function _clearAgentTaskFile(agentId) {
  const filePath = path.join(getWorkspacePath(agentId), "task.json");
  try {
    await fs.unlink(filePath);
  } catch (_) {
    /* ignore */
  }
}

// =============================================================================
// Content extraction
// =============================================================================

/**
 * Extract plain text from an assistant message content field.
 * @param {string|Array} content
 * @returns {string}
 */
function _extractAssistantText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content || "");

  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text || "")
    .join("\n")
    .trim();
}

// =============================================================================
// Orchestrator response parsing
// =============================================================================

/**
 * Extract a CLARIFY question from the orchestrator response, or null.
 * Captures the rest of the CLARIFY line. If the line is very short (truncated),
 * also captures subsequent non-blank lines as continuation.
 * @param {string} text
 * @returns {string|null}
 */
function _parseClarify(text) {
  if (!text) return null;
  const match = text.match(/^CLARIFY:\s*(.+)/im);
  if (!match) return null;
  let question = match[1].trim();
  // If the captured text looks truncated (ends mid-sentence without punctuation),
  // grab continuation lines until the next blank line.
  if (question.length < 80 && !/[.?!]$/.test(question)) {
    const afterClarify = text.slice(text.indexOf(match[0]) + match[0].length).trim();
    const continuation = afterClarify.split(/\n\n/)[0].trim();
    if (continuation) question = `${question} ${continuation}`;
  }
  return question;
}

/**
 * Parse a Format-A delegation response.
 * Returns null when no DELEGATE directives are found.
 * @param {string} text
 */
function _parsePlan(text) {
  if (!text) return null;

  const planMatch = text.match(/^PLAN:\s*(.+)/im);
  const plan = planMatch ? planMatch[1].trim() : "";

  const delegates = [];
  const delegateRe = /^DELEGATE\(([^)]+)\):\s*(.+)$/gim;
  let m;
  while ((m = delegateRe.exec(text)) !== null) {
    delegates.push({ agentId: m[1].trim(), instruction: m[2].trim() });
  }

  if (delegates.length === 0) return null;

  const depends = new Map();
  const dependsMatch = text.match(/^DEPENDS:\s*(.+)$/im);
  if (dependsMatch) {
    for (const pair of dependsMatch[1].split(",")) {
      const [dependent, prerequisite] = pair.split("->").map((s) => s.trim());
      if (dependent && prerequisite) {
        if (!depends.has(dependent)) depends.set(dependent, []);
        depends.get(dependent).push(prerequisite);
      }
    }
  }

  return { plan, delegates, depends };
}

/**
 * Fuzzy-parse delegation from free-form text when strict parsing fails.
 * @param {string} text
 * @param {string[]} agentIds
 */
function _parsePlanFuzzy(text, agentIds) {
  if (!text || !agentIds?.length) return null;

  const delegates = [];
  const lines = text.split("\n");

  for (const line of lines) {
    for (const agentId of agentIds) {
      if (delegates.find((d) => d.agentId === agentId)) continue;
      const patterns = [
        new RegExp(`\\b${agentId}\\b\\s*[:\\-–—]+\\s*(.{10,})`, "i"),
        new RegExp(`(?:assign|delegate|send|give)\\s+(?:to\\s+)?(?:the\\s+)?\\b${agentId}\\b[:\\s]+(.{10,})`, "i"),
        new RegExp(`(?:the\\s+)?\\b${agentId}\\b\\s+(?:should|will|can|must|needs to)\\s+(.{10,})`, "i"),
      ];
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          delegates.push({ agentId, instruction: match[1].trim() });
          break;
        }
      }
    }
  }

  if (delegates.length === 0) return null;

  const planLine = lines.find((l) => l.trim().length > 10) || "";
  return { plan: planLine.trim().slice(0, 200), delegates, depends: new Map() };
}

// =============================================================================
// Result sanitizer
// =============================================================================

const TOOL_FAILURE_PATTERNS = [
  /unable to (?:read|access|use|execute) (?:the |a )?(?:\w+ )?(?:skill|tool)/i,
  /command not found/i,
  /persistent path errors in the sandbox/i,
  /the .+ (?:tool|skill) is (?:currently )?(?:inaccessible|unavailable)/i,
  /I am blocked from performing/i,
  /please advise on (?:the )?(?:next steps|how to proceed)/i,
  /specialized knowledge tool .+ is currently inaccessible/i,
  /tool failure|skill failure/i,
];

/**
 * Detect and clean agent output that contains repeated tool/skill execution failures.
 * @param {string} result
 * @returns {string}
 */
function _sanitizeAgentResult(result) {
  if (!result) return result;

  const matchCount = TOOL_FAILURE_PATTERNS.filter((p) => p.test(result)).length;
  if (matchCount < 2) return result;

  const lines = result.split("\n");
  const useful = lines.filter((line) => {
    const l = line.trim();
    if (!l) return false;
    if (TOOL_FAILURE_PATTERNS.some((p) => p.test(l))) return false;
    if (/^(?:since|because|however|unfortunately|i apologize|as the)/i.test(l)) return false;
    if (/^(?:plan adjustment|acknowledge limitation|required research)/i.test(l)) return false;
    return true;
  });

  if (useful.length > 3) {
    return (
      "[Note: Agent encountered tool/skill errors — useful content extracted below]\n\n" +
      useful.join("\n")
    );
  }

  return (
    "[Agent output contained repeated tool/skill execution errors. " +
    "The requested tools may not be installed. " +
    "Agents have access to built-in coding tools (file read/write, shell, code execution) only.]"
  );
}

// =============================================================================
// Agent communication directive parsers
// =============================================================================

/**
 * Parse QUERY_AGENT(<targetId>): <question> directives from agent output.
 * Agents use these to request information from peer agents via the orchestrator.
 *
 * @param {string} text
 * @returns {Array<{ targetAgentId: string, question: string }>}
 */
function _parseQueryAgentDirectives(text) {
  if (!text) return [];
  const re = /^QUERY_AGENT\(([^)]+)\):\s*(.+)$/gim;
  const results = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    results.push({ targetAgentId: m[1].trim(), question: m[2].trim() });
  }
  return results;
}

/**
 * Parse NEEDS_CONTEXT_FROM(<agentId>): <description> directives.
 * Agents use these to declare upfront what peer output they need.
 * Resolved identically to QUERY_AGENT.
 *
 * @param {string} text
 * @returns {Array<{ agentId: string, description: string }>}
 */
function _parseNeedsContextFrom(text) {
  if (!text) return [];
  const re = /^NEEDS_CONTEXT_FROM\(([^)]+)\):\s*(.+)$/gim;
  const results = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    results.push({ agentId: m[1].trim(), description: m[2].trim() });
  }
  return results;
}

/**
 * Parse NEEDS_WRITE: <description> directive.
 * Returns the description string if present, null otherwise.
 * Triggers write mutex acquisition before the agent's re-run.
 *
 * @param {string} text
 * @returns {string|null}
 */
function _parseNeedsWrite(text) {
  if (!text) return null;
  const m = text.match(/^NEEDS_WRITE:\s*(.+)$/im);
  return m ? m[1].trim() : null;
}

// =============================================================================
// Write mutex — per-task serialization of write-intending agents
// =============================================================================

/**
 * Promise-chain mutex for serializing file writes across agents within one task.
 * FIFO ordering. One instance created per orchestrator pipeline run.
 *
 * Usage:
 *   const release = await writeMutex.acquire();
 *   try { ... write files ... } finally { release(); }
 */
class WriteMutex {
  constructor() {
    this._tail = Promise.resolve();
  }

  /**
   * Acquire the write lock. Resolves with a release function.
   * The caller MUST invoke the returned release function in a finally block.
   *
   * @returns {Promise<function>}
   */
  acquire() {
    let release;
    const ticket = new Promise((res) => { release = res; });
    const prev = this._tail;
    this._tail = prev.then(() => ticket);
    return prev.then(() => release);
  }
}

// =============================================================================
// Agent priority ordering
// =============================================================================

/** Dispatch order within a wave — lower number = dispatched first. */
const PRIORITY_ORDER = { critical: 0, high: 1, normal: 2, low: 3 };

/** Maximum rounds of directive resolution (QUERY_AGENT / NEEDS_WRITE) per dispatch. */
const MAX_DIRECTIVE_ROUNDS = 2;

// =============================================================================
// Agent model + priority lookups
// =============================================================================

/** Fallback models when Supabase is unavailable. */
const DEFAULT_AGENT_MODELS = {
  orchestrator: "gemini/gemini-1.5-pro",
  pm: "gemini/gemini-2.0-flash",
  coder: "gemini/gemini-2.0-flash",
  qa: "gemini/gemini-2.0-flash",
  cybersec: "gemini/gemini-2.0-flash",
  design: "gemini/gemini-2.0-flash",
  marketing: "gemini/gemini-2.0-flash",
  research: "gemini/gemini-2.0-flash",
  patrol: "gemini/gemini-2.0-flash",
};

const TIMEOUT_CLOUD_MS = 300_000;
const TIMEOUT_LOCAL_MS = 900_000;

/**
 * Returns true when the model string indicates a locally-hosted model
 * (Ollama, LM Studio, llama.cpp, etc.) that serializes inference requests.
 * @param {string} model
 * @returns {boolean}
 */
function _isLocalModel(model) {
  if (!model) return false;
  const m = model.toLowerCase();
  return (
    m.startsWith("ollama/") ||
    m.startsWith("lm-studio/") ||
    m.startsWith("lm_studio/") ||
    m.startsWith("llamacpp/") ||
    m.startsWith("llama.cpp/") ||
    m.startsWith("local/") ||
    !m.includes("/")
  );
}

/** Role labels used in dispatch prefixes. */
const AGENT_ROLES = {
  orchestrator: "Orchestrator (CEO & Task Router)",
  pm: "Project Manager (Planning & Specification)",
  coder: "Software Engineer (Implementation)",
  qa: "QA Engineer (Testing & Validation)",
  cybersec: "Security Analyst (Audit & Hardening)",
  design: "UI/UX Designer (Visual Design)",
  marketing: "Marketing Strategist (Copywriting & Growth)",
  research: "Research Analyst (Market Intelligence)",
  patrol: "Watchdog Agent (Monitoring & Recovery)",
};

/** Per-agent accurate tool descriptions included in prompt context strings. */
const AGENT_TOOL_DESCRIPTIONS = {
  orchestrator: "exec (shell), read (files), write (files)",
  coder:        "exec (shell + run code), read (files), write (files), browser (web)",
  qa:           "exec (run tests/scripts), read (files) — no write access",
  cybersec:     "exec (read-only scanning), read (files) — no write access",
  pm:           "read (files), write (files)",
  design:       "read (files), write (files)",
  marketing:    "exec (curl for web research), read (files), write (files)",
  research:     "exec (curl for web fetching), read (files) — no write",
  patrol:       "read (files), exec (read-only checks), sessions_list, session_status",
};

/**
 * Per-agent directive guidance injected as the ROLE block in each dispatch.
 * Tells agents exactly WHO they are and HOW to use their tools to produce output.
 */
const AGENT_DISPATCH_GUIDANCE = {
  orchestrator:
    "You are the Orchestrator (CEO & Task Router). Coordinate agents and synthesize results. " +
    "Do NOT do specialized work yourself — delegate it.",

  coder:
    "You are a Software Engineer. Your job is to WRITE CODE and BUILD real things.\n" +
    "CRITICAL PATH RULE: ALL write paths must be RELATIVE — never absolute.\n" +
    "  CORRECT: write(path=\"index.html\"), write(path=\"src/app.js\")\n" +
    "  WRONG:   write(path=\"/workspace/index.html\"), write(path=\"/\") — sandbox will reject these.\n" +
    "- Use exec to run shell commands: install packages, compile, run scripts\n" +
    "- Use write to create and save files — relative paths only (e.g., index.html, styles.css)\n" +
    "- Use read to examine existing files before editing\n" +
    "DO NOT just describe what to do — use exec and write to produce real files.",

  qa:
    "You are a QA Engineer. Your job is to TEST and VALIDATE with real results.\n" +
    "- Use exec to run test suites (npm test, pytest, go test, etc.)\n" +
    "- Use read to examine source code and existing test files\n" +
    "- Report actual test output, not hypothetical descriptions.",

  cybersec:
    "You are a Security Analyst. Your job is to AUDIT code for vulnerabilities.\n" +
    "- Use exec to run security scanning commands\n" +
    "- Use read to examine source files for OWASP issues\n" +
    "- Provide specific findings with file paths and line numbers.\n" +
    "Do NOT modify files — this is a read-only audit role.",

  pm:
    "You are a Project Manager. Your job is to PLAN and DOCUMENT.\n" +
    "- Use read to understand the existing project structure\n" +
    "- Use write to create PRD, task breakdown, and specification documents\n" +
    "Deliver concrete artifacts, not vague plans.",

  design:
    "You are a UI/UX Designer. Your job is to CREATE design specifications and mockups.\n" +
    "- Use read to understand existing UI components and styles\n" +
    "- Use write to produce HTML/CSS mockups, component specs, color palettes\n" +
    "Deliver real artifacts: working HTML files, style guides, component specs.",

  marketing:
    "You are a Marketing Strategist. Your job is to CREATE copy and content.\n" +
    "- Use exec+curl to research competitors: exec: curl -sL \"https://competitor.com\" | head -200\n" +
    "- Use write to produce the actual content: headlines, landing page copy, email drafts\n" +
    "- Use read to review existing content before writing\n" +
    "Deliver real written content saved with write, not a description of what to write.",

  research:
    "You are a Research Analyst. Use exec with curl to fetch real web pages.\n" +
    "- Fetch pages: exec → curl -sL \"https://example.com\" | head -200\n" +
    "- Search Google: exec → curl -sL \"https://www.google.com/search?q=your+query\" | grep -o '<h3[^>]*>[^<]*</h3>'\n" +
    "- Do NOT rely on training knowledge alone — use exec+curl to get real current data\n" +
    "- Use read to access local files if needed\n" +
    "Produce a research report with specific findings and the URLs you fetched.",

  patrol:
    "You are a Watchdog Agent. Your job is to MONITOR and REPORT system status.\n" +
    "- Use exec to run health checks and status commands\n" +
    "- Use read to examine logs and config files\n" +
    "- Use sessions_list and session_status to check other agent sessions\n" +
    "Report concrete findings with specifics.",
};

/**
 * Fetch { agentId → model } map from Supabase.
 * Falls back to hardcoded defaults if the DB is unavailable.
 * @returns {Promise<Record<string, string>>}
 */
async function _getAgentModels() {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data } = await supabase
        .from("agents")
        .select("id, model")
        .order("id");
      if (data?.length) {
        return Object.fromEntries(data.map((a) => [a.id, a.model]));
      }
    } catch (_) {
      /* fall through to defaults */
    }
  }
  return { ...DEFAULT_AGENT_MODELS };
}

/**
 * Fetch { agentId → priority } map from Supabase.
 * Falls back to empty object (all agents treated as 'normal') if unavailable.
 * @returns {Promise<Record<string, string>>}
 */
async function _getAgentPriorities() {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data } = await supabase
        .from("agents")
        .select("id, priority")
        .order("id");
      if (data?.length) {
        return Object.fromEntries(data.map((a) => [a.id, a.priority || "normal"]));
      }
    } catch (_) {
      /* priority column may not exist yet on older installs — fall through */
    }
  }
  return {};
}

// =============================================================================
// Skill scanning
// =============================================================================

/**
 * Scan installed skills from disk and return their names.
 * Non-fatal: returns empty array on any error.
 * @returns {Promise<string[]>}
 */
async function _scanInstalledSkillNames() {
  const names = new Set();

  async function scanDir(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          await fs.access(path.join(dir, entry.name, "SKILL.md"));
          names.add(entry.name);
        } catch (_) {
          /* not a valid skill */
        }
      }
    } catch (_) {
      /* directory doesn't exist */
    }
  }

  await scanDir(path.join(getOpenClawBase(), "skills"));

  try {
    const base = getOpenClawBase();
    const topEntries = await fs.readdir(base, { withFileTypes: true });
    for (const entry of topEntries) {
      if (entry.isDirectory() && entry.name.startsWith("workspace-")) {
        await scanDir(path.join(base, entry.name, "skills"));
      }
    }
  } catch (_) {
    /* ignore */
  }

  return Array.from(names);
}

// =============================================================================
// Session key helpers
// =============================================================================

/**
 * Return the session key for an agent + task pair.
 *
 * Format: "agent:<agentId>:<taskShortId>"
 * The gateway extracts the agentId from the "agent:<id>:" prefix for routing,
 * while the full key (including the task suffix) uniquely identifies the session,
 * giving each task a fresh context window without cross-task history bleed.
 *
 * @param {string} agentId
 * @param {string} taskId
 * @returns {string}
 */
function _sessionKey(agentId, taskId) {
  const suffix = taskId ? taskId.replace(/-/g, "").slice(0, 12) : "default";
  return `agent:${agentId}:${suffix}`;
}

// =============================================================================
// Session spawning
// =============================================================================

/**
 * Spawn a session for an agent via chat.send + waitForRunCompletion.
 * @param {string} agentId
 * @param {string} task
 * @param {string} model
 * @param {number} [timeoutMs=300_000]
 * @param {string} [sessionKey]  Defaults to agentId. Pass a per-task key for isolation.
 * @returns {Promise<{ result: string, runId: string }>}
 */
async function _spawnSession(agentId, task, model, timeoutMs = 300_000, sessionKey) {
  const key = sessionKey || agentId;
  const response = await gatewayBridge.request(
    "chat.send",
    { sessionKey: key, message: task, idempotencyKey: uuidv4() },
    30_000,
  );

  console.log(`[orchestrator:diag] chat.send response for "${agentId}" (session=${key}):`, JSON.stringify(response, null, 2));

  const runId = response?.runId;
  if (!runId) {
    console.error(`[orchestrator:diag] chat.send response has no runId. Keys: ${response ? Object.keys(response).join(", ") : "(null)"}`);
    throw new Error(`chat.send for "${agentId}" returned no runId`);
  }

  console.log(`[orchestrator:diag] waiting for run completion: runId=${runId}, timeout=${timeoutMs}ms`);
  const completion = await gatewayBridge.waitForRunCompletion(runId, timeoutMs);

  let result = completion.result || "";

  if (!result) {
    console.log(`[orchestrator:diag] no streamed result for "${agentId}" — fetching via chat.history`);
    try {
      const history = await gatewayBridge.request(
        "chat.history",
        { sessionKey: key, limit: 5 },
        15_000,
      );
      console.log(`[orchestrator:diag] chat.history for "${agentId}":`, JSON.stringify(history, null, 2).slice(0, 2000));

      const messages = history?.messages || history?.items || (Array.isArray(history) ? history : []);
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === "assistant" || msg.from === "assistant" || msg.type === "assistant") {
          result = _extractAssistantText(msg.content || msg.text || msg.message || "");
          break;
        }
      }
      console.log(`[orchestrator:diag] chat.history extracted: ${result.length} chars`);
    } catch (err) {
      console.error(`[orchestrator:diag] chat.history failed for "${agentId}":`, err.message);
    }
  }

  console.log(`[orchestrator:diag] run completed for "${agentId}": ${result.length} chars`);
  return { result, runId };
}

// =============================================================================
// Planning prompt
// =============================================================================

/**
 * Build the orchestrator planning prompt.
 * @param {string} goal
 * @param {string[]} [installedSkillNames]
 */
async function buildPlanningPrompt(goal, installedSkillNames = []) {
  const supabase = getSupabase();
  let agentList = [];

  if (supabase) {
    try {
      const { data } = await supabase
        .from("agents")
        .select("id, name, role")
        .neq("id", "orchestrator")
        .order("id");
      if (data?.length) agentList = data;
    } catch (_) {
      /* ignore */
    }
  }

  if (agentList.length === 0) {
    agentList = [
      { id: "pm",       name: "PM",       role: "Planning" },
      { id: "coder",    name: "Coder",    role: "Engineering" },
      { id: "qa",       name: "QA",       role: "Testing" },
      { id: "cybersec", name: "CyberSec", role: "Security" },
      { id: "design",   name: "Design",   role: "UI/UX" },
      { id: "marketing",name: "Marketing",role: "Copy" },
      { id: "research", name: "Research", role: "Research" },
      { id: "patrol",   name: "Patrol",   role: "Watchdog" },
    ];
  }

  const lines = agentList.map((a) => `- ${a.id}: ${a.name} (${a.role})`).join("\n");

  const skillNote = installedSkillNames.length > 0
    ? `Installed skills: ${installedSkillNames.join(", ")}.`
    : "No external skills are installed.";

  const toolContext =
    `## Available Tools\n` +
    `Each agent has specific tools:\n` +
    `- coder: exec (shell + run code), read (files), write (files), browser (web)\n` +
    `- qa: exec (run tests), read (files) — no write\n` +
    `- cybersec: exec (scanning), read (files) — no write\n` +
    `- pm: read (files), write (files)\n` +
    `- design: read (files), write (files)\n` +
    `- marketing: read (files), write (files), browser (web)\n` +
    `- research: exec (curl for web fetching/searching), read (files) — no write\n` +
    `- patrol: read (files), exec (read-only checks), sessions_list, session_status\n` +
    `${skillNote}\n` +
    `Your job here is ONLY to output a delegation plan — not to execute anything.\n\n`;

  return (
    `# Task Planning Request\n\n` +
    `Your agent fleet:\n${lines}\n\n` +
    toolContext +
    `## Output Format (follow EXACTLY)\n\n` +
    `If the goal needs clarification:\n` +
    `CLARIFY: <your question>\n\n` +
    `If the goal is actionable, output ONLY these lines:\n` +
    `PLAN: <one-line summary>\n` +
    `DELEGATE(<agentId>): <specific instruction>\n` +
    `DEPENDS: dependent->prerequisite, ...  (optional)\n\n` +
    `### Example 1\n` +
    `PLAN: Build a landing page with copy, design, and code\n` +
    `DELEGATE(research): Research competitor landing pages and identify best practices\n` +
    `DELEGATE(marketing): Write headline, subheading, CTA, and feature descriptions\n` +
    `DELEGATE(design): Design the page layout, color scheme, and component specs\n` +
    `DELEGATE(coder): Implement the landing page in HTML/CSS/JS\n` +
    `DEPENDS: marketing->research, design->research, coder->marketing, coder->design\n\n` +
    `### Example 2\n` +
    `PLAN: Security audit of the API\n` +
    `DELEGATE(cybersec): Scan API endpoints for OWASP Top 10 vulnerabilities\n` +
    `DELEGATE(qa): Write integration tests for authentication and authorization\n` +
    `DEPENDS: qa->cybersec\n\n` +
    `IMPORTANT: Output ONLY the PLAN/DELEGATE/DEPENDS lines. No other text, no tool calls, no prose.\n\n` +
    `## Goal\n${goal}`
  );
}

// =============================================================================
// Status emission helpers
// =============================================================================

/**
 * Emit an agent status change to the renderer. Non-fatal.
 * @param {Electron.BrowserWindow|null} mainWindow
 * @param {string} agentId
 * @param {string} status
 * @param {string|null} currentAction
 */
function _emitAgentStatus(mainWindow, agentId, status, currentAction) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("agent:status-changed", {
    agentId,
    status,
    currentAction: currentAction || null,
  });
}

/**
 * Emit an agent result snippet to the activity feed. Non-fatal.
 * @param {Electron.BrowserWindow|null} mainWindow
 * @param {string} agentId
 * @param {string} text
 */
function _emitAgentMessage(mainWindow, agentId, text) {
  if (!mainWindow || mainWindow.isDestroyed() || !text) return;
  mainWindow.webContents.send("agent:message-received", {
    agentId,
    text: text.slice(0, 500),
    timestamp: Date.now(),
  });
}

// =============================================================================
// Peer agent query resolution
// =============================================================================

/**
 * Dispatch a single-shot session to a peer agent to answer a QUERY_AGENT or
 * NEEDS_CONTEXT_FROM request. Intentionally no multi-turn and no write access
 * to prevent recursive query chains (A→B→C→...).
 *
 * @param {string} targetAgentId
 * @param {string} question
 * @param {string} model
 * @param {number} timeoutMs
 * @param {Electron.BrowserWindow|null} mainWindow
 * @param {string[]} installedSkillNames
 * @returns {Promise<string>}
 */
async function _resolveAgentQuery(targetAgentId, question, model, timeoutMs, mainWindow, installedSkillNames) {
  const roleLabel = AGENT_ROLES[targetAgentId] || targetAgentId;
  const toolDesc = AGENT_TOOL_DESCRIPTIONS[targetAgentId] || "file read/write, shell commands, code execution";
  const skillNote = installedSkillNames.length > 0
    ? `Installed skills: ${installedSkillNames.join(", ")}.`
    : "No external skills are installed.";

  const agentGuidance = AGENT_DISPATCH_GUIDANCE[targetAgentId]
    || `You are the ${roleLabel}. Answer based on your expertise.`;

  const instruction =
    `[ROLE: ${agentGuidance}]\n` +
    `[TOOLS: You have ${toolDesc}. ${skillNote}]\n\n` +
    `Answer the following question concisely:\n` +
    question;

  console.log(`[orchestrator] peer query -> ${targetAgentId}: "${question.slice(0, 80)}"`);
  try {
    const { result } = await _spawnSession(targetAgentId, instruction, model, Math.min(timeoutMs, 60_000));
    const answer = _sanitizeAgentResult(result) || "(no response)";
    console.log(`[orchestrator] peer query <- ${targetAgentId}: "${answer.slice(0, 120)}"`);
    return answer;
  } catch (err) {
    console.warn(`[orchestrator] peer query to "${targetAgentId}" failed:`, err.message);
    return `ERROR: ${err.message}`;
  }
}

// =============================================================================
// Single-agent dispatch — multi-turn with directive resolution
// =============================================================================

/**
 * Dispatch one agent: write its task.json, then run up to MAX_DIRECTIVE_ROUNDS+1
 * sessions resolving QUERY_AGENT, NEEDS_CONTEXT_FROM, and NEEDS_WRITE directives.
 *
 * Directive protocol (emitted in agent text output):
 *   QUERY_AGENT(<agentId>): <question>        → fetch answer from peer, inject, re-run
 *   NEEDS_CONTEXT_FROM(<agentId>): <desc>     → same as QUERY_AGENT (upfront declaration)
 *   NEEDS_WRITE: <description>                → acquire write mutex, inject WRITE_GRANTED, re-run
 *
 * @param {string} agentId
 * @param {string} instruction
 * @param {object} taskFileData
 * @param {string} model
 * @param {number} [timeoutMs=300_000]
 * @param {Electron.BrowserWindow|null} [mainWindow=null]
 * @param {string[]} [installedSkillNames=[]]
 * @param {WriteMutex|null} [writeMutex=null]
 * @param {string} [sessionKey]  Per-task session key for isolation (built by _sessionKey)
 * @returns {Promise<string>}
 */
async function _dispatchAgent(
  agentId,
  instruction,
  taskFileData,
  model,
  timeoutMs = 300_000,
  mainWindow = null,
  installedSkillNames = [],
  writeMutex = null,
  sessionKey = null,
) {
  const key = sessionKey || agentId;
  console.log(`[orchestrator] dispatch -> ${agentId} session=${key} (model=${model}): "${instruction.slice(0, 120)}"`);

  _emitAgentStatus(mainWindow, agentId, "running", instruction.slice(0, 120));

  await _writeAgentTaskFile(agentId, taskFileData);

  const roleLabel = AGENT_ROLES[agentId] || agentId;

  // Build context from peer agents. Prerequisite agents (declared via DEPENDS) get
  // full output (up to 3000 chars); incidental peers get a brief excerpt (up to 600 chars).
  const prereqIds = new Set(Object.keys(taskFileData.prerequisiteResults || {}));
  let peerSummary = "";
  if (taskFileData.peerResults && Object.keys(taskFileData.peerResults).length > 0) {
    const prereqEntries = Object.entries(taskFileData.peerResults)
      .filter(([id]) => prereqIds.has(id));
    const otherEntries = Object.entries(taskFileData.peerResults)
      .filter(([id]) => !prereqIds.has(id));

    const sections = [];
    if (prereqEntries.length > 0) {
      sections.push(
        `## Output from prerequisite agents (read carefully — you depend on these):\n` +
        prereqEntries.map(([id, res]) => `### [${id}]\n${String(res).slice(0, 3000)}`).join("\n\n")
      );
    }
    if (otherEntries.length > 0) {
      sections.push(
        `## Context from other completed agents (for reference):\n` +
        otherEntries.map(([id, res]) => `[${id}]: ${String(res).slice(0, 600)}`).join("\n\n")
      );
    }
    peerSummary = sections.length > 0 ? `\n\n${sections.join("\n\n")}` : "";
  }

  const toolDesc = AGENT_TOOL_DESCRIPTIONS[agentId] || "file read/write, shell commands, code execution";
  const skillNote = installedSkillNames.length > 0
    ? `Installed skills: ${installedSkillNames.join(", ")}.`
    : "No external skills are installed.";
  const toolClause =
    `[TOOLS: You have ${toolDesc}. ${skillNote} ` +
    `Do NOT attempt to use tools or skills that are not listed here.]\n\n`;

  const agentGuidance = AGENT_DISPATCH_GUIDANCE[agentId]
    || `You are the ${roleLabel}. Complete your assigned task. Produce real output — do NOT just describe what to do.`;

  const baseInstruction =
    `[ROLE: ${agentGuidance}]\n` +
    toolClause +
    instruction +
    peerSummary;

  let currentInstruction = baseInstruction;
  let result = "";
  let releaseWrite = null;

  try {
    for (let round = 0; round <= MAX_DIRECTIVE_ROUNDS; round++) {
      const { result: rawResult } = await _spawnSession(agentId, currentInstruction, model, timeoutMs, key);
      result = _sanitizeAgentResult(rawResult);
      console.log(`[orchestrator] dispatch <- ${agentId} round=${round}: ${result?.length ?? 0} chars — "${(result || "").slice(0, 200)}"`);

      // On the last allowed round, stop processing directives and return
      if (round === MAX_DIRECTIVE_ROUNDS) break;

      const queries      = _parseQueryAgentDirectives(result);
      const contextNeeds = _parseNeedsContextFrom(result);
      const needsWrite   = _parseNeedsWrite(result);

      const hasDirectives = queries.length > 0 || contextNeeds.length > 0 || needsWrite !== null;
      if (!hasDirectives) break;

      const injections = [];

      // Resolve QUERY_AGENT and NEEDS_CONTEXT_FROM — same resolution path
      const allQueries = [
        ...queries.map((q) => ({ targetAgentId: q.targetAgentId, question: q.question })),
        ...contextNeeds.map((n) => ({ targetAgentId: n.agentId, question: n.description })),
      ].filter((q) => q.targetAgentId && q.targetAgentId !== agentId);

      if (allQueries.length > 0) {
        _emitAgentStatus(mainWindow, agentId, "querying", "Querying peer agents...");
        for (const query of allQueries) {
          const answer = await _resolveAgentQuery(
            query.targetAgentId,
            query.question,
            model,
            timeoutMs,
            mainWindow,
            installedSkillNames,
          );
          injections.push(`[AGENT_RESPONSE from ${query.targetAgentId}]: ${answer}`);
        }
        _emitAgentStatus(mainWindow, agentId, "running", instruction.slice(0, 120));
      }

      // Acquire write mutex if agent declared write intent (only once per dispatch)
      if (needsWrite !== null && writeMutex && releaseWrite === null) {
        _emitAgentStatus(mainWindow, agentId, "write-queued", "Waiting for write access...");
        releaseWrite = await writeMutex.acquire();
        _emitAgentStatus(mainWindow, agentId, "writing", needsWrite.slice(0, 100));
        injections.push(
          `WRITE_GRANTED: You now have exclusive write access. Proceed with writing: ${needsWrite}`
        );
      }

      if (injections.length === 0) break;

      currentInstruction = baseInstruction + "\n\n---\n" + injections.join("\n\n");
    }

    console.log(`[orchestrator] dispatch done ${agentId}: ${result?.length ?? 0} chars`);
    _emitAgentStatus(mainWindow, agentId, "idle", null);
    _emitAgentMessage(mainWindow, agentId, result);

    return result;
  } catch (err) {
    _emitAgentStatus(mainWindow, agentId, "error", null);
    throw err;
  } finally {
    if (releaseWrite) releaseWrite();
    await _clearAgentTaskFile(agentId);
  }
}

// =============================================================================
// Dependency-ordered parallel execution
// =============================================================================

/**
 * Execute all delegates in waves, respecting DEPENDS ordering and agent priority.
 *
 * Within each wave:
 *   - Delegates are sorted by priority (critical > high > normal > low)
 *   - Cloud agents run in parallel; local agents run sequentially
 *   - Write-intending agents serialize via WriteMutex without blocking read agents
 *
 * @param {Array<{ agentId: string, instruction: string }>} delegates
 * @param {Map<string, string[]>} depends
 * @param {object} baseTaskData
 * @param {Record<string, string>} models
 * @param {Electron.BrowserWindow|null} [mainWindow=null]
 * @param {string[]} [installedSkillNames=[]]
 * @param {WriteMutex|null} [writeMutex=null]
 * @param {Record<string, string>} [priorities={}]
 * @returns {Promise<Map<string, string>>}
 */
async function _executeWithDependencies(
  delegates,
  depends,
  baseTaskData,
  models,
  mainWindow = null,
  installedSkillNames = [],
  writeMutex = null,
  priorities = {},
) {
  /** @type {Map<string, string>} */
  const results = new Map();
  const completed = new Set();

  function getReadyDelegates() {
    return delegates.filter((d) => {
      if (completed.has(d.agentId)) return false;
      const prereqs = depends.get(d.agentId) || [];
      return prereqs.every((p) => completed.has(p));
    });
  }

  async function runDelegate(delegate) {
    const prereqResults = {};
    for (const prereqId of depends.get(delegate.agentId) || []) {
      if (results.has(prereqId)) prereqResults[prereqId] = results.get(prereqId);
    }

    const peerResults = {};
    for (const [id, r] of results.entries()) {
      if (id !== delegate.agentId) peerResults[id] = r;
    }

    const taskFileData = {
      ...baseTaskData,
      agentId: delegate.agentId,
      instruction: delegate.instruction,
      prerequisiteResults: prereqResults,
      peerResults,
      issuedAt: new Date().toISOString(),
    };

    const model =
      models?.[delegate.agentId] || DEFAULT_AGENT_MODELS[delegate.agentId] || "gemini/gemini-2.0-flash";
    const timeoutMs = _isLocalModel(model) ? TIMEOUT_LOCAL_MS : TIMEOUT_CLOUD_MS;

    const sk = _sessionKey(delegate.agentId, baseTaskData.taskId);
    const result = await _dispatchAgent(
      delegate.agentId,
      delegate.instruction,
      taskFileData,
      model,
      timeoutMs,
      mainWindow,
      installedSkillNames,
      writeMutex,
      sk,
    );
    return { agentId: delegate.agentId, result };
  }

  /**
   * Apply settled outcomes to the shared results/completed maps.
   * Throws QuotaExhaustedError on the first quota hit.
   */
  function applyOutcomes(outcomeMap) {
    for (const [agentId, outcome] of outcomeMap) {
      if (outcome.status === "fulfilled") {
        results.set(agentId, outcome.value.result);
      } else {
        const errMsg = outcome.reason?.message || "Agent failed";
        console.error(`[orchestrator] ${agentId} failed: ${errMsg}`);

        const { isQuotaError, provider, errorType } = detectQuotaError(errMsg);
        if (isQuotaError) {
          throw new QuotaExhaustedError(errMsg, {
            provider,
            errorType,
            partialResults: new Map(results),
            phase: "delegation",
            completedAgents: Array.from(completed),
          });
        }

        results.set(agentId, `ERROR: ${errMsg}`);
      }
      completed.add(agentId);
    }
  }

  while (completed.size < delegates.length) {
    let wave = getReadyDelegates();

    if (wave.length === 0) {
      wave = delegates.filter((d) => !completed.has(d.agentId));
    }

    // Sort wave by agent priority — higher priority dispatches first within a dependency tier
    wave.sort((a, b) => {
      const pa = PRIORITY_ORDER[priorities?.[a.agentId] ?? "normal"] ?? 2;
      const pb = PRIORITY_ORDER[priorities?.[b.agentId] ?? "normal"] ?? 2;
      return pa - pb;
    });

    // Split wave by provider type
    const cloudGroup = wave.filter(
      (d) => !_isLocalModel(models?.[d.agentId] || DEFAULT_AGENT_MODELS[d.agentId] || "")
    );
    const localGroup = wave.filter(
      (d) => _isLocalModel(models?.[d.agentId] || DEFAULT_AGENT_MODELS[d.agentId] || "")
    );

    if (cloudGroup.length > 0 || localGroup.length > 0) {
      console.log(
        `[orchestrator] wave: ${cloudGroup.length} cloud (parallel) + ${localGroup.length} local (sequential)`
      );
    }

    for (let i = 1; i < localGroup.length; i++) {
      _emitAgentStatus(mainWindow, localGroup[i].agentId, "queued", "Waiting for local model...");
    }

    const waveOutcomeMap = new Map();

    await Promise.all([
      Promise.allSettled(cloudGroup.map(runDelegate)).then((outcomes) => {
        cloudGroup.forEach((d, i) => waveOutcomeMap.set(d.agentId, outcomes[i]));
      }),
      (async () => {
        for (const delegate of localGroup) {
          const [outcome] = await Promise.allSettled([runDelegate(delegate)]);
          waveOutcomeMap.set(delegate.agentId, outcome);
        }
      })(),
    ]);

    applyOutcomes(waveOutcomeMap);
  }

  return results;
}

// =============================================================================
// Supabase helpers
// =============================================================================

async function _updateTask(supabase, taskId, updates) {
  if (!supabase) return;
  try {
    await supabase.from("tasks").update(updates).eq("id", taskId);
  } catch (err) {
    console.error("[orchestrator] task update failed:", err.message);
  }
}

async function _updateBuild(supabase, buildId, updates, persistRow = true) {
  if (!supabase || !persistRow) return;
  try {
    await supabase.from("builds").update(updates).eq("id", buildId);
  } catch (err) {
    console.error("[orchestrator] build update failed:", err.message);
  }
}

/**
 * Request user approval before marking a task complete.
 */
async function _requestApproval(supabase, taskId, buildId, result, _userId, mainWindow, persistBuildRow = true) {
  await _updateTask(supabase, taskId, { status: "awaiting_approval", result });
  await _updateBuild(supabase, buildId, { status: "awaiting_approval", output: result }, persistBuildRow);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("task:awaiting-approval", { taskId, result });
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Run the full orchestration pipeline for a submitted goal.
 *
 * @param {{
 *   taskId: string,
 *   goal: string,
 *   metadata?: object,
 *   mainWindow: Electron.BrowserWindow,
 *   userId: string
 * }} opts
 */
async function execute({ taskId, goal, metadata, mainWindow, userId }) {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const buildId = uuidv4();

  _activeTasks.set(taskId, { buildId });

  let buildRowInDb = false;

  if (supabase) {
    const { error: buildErr } = await safeInsert(supabase, "builds", {
      id: buildId,
      task_id: taskId,
      status: "running",
      title: goal.slice(0, 120),
      description: goal,
      started_at: now,
      user_id: userId,
      created_at: now,
    });
    if (buildErr) {
      console.error("[orchestrator] build insert failed:", buildErr.message);
    } else {
      buildRowInDb = true;
    }

    await _updateTask(supabase, taskId, { status: "running" });
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("build:started", { taskId, buildId, goal });
  }

  try {
    const agentModels = await _getAgentModels();
    const orchestratorModel = agentModels["orchestrator"] || DEFAULT_AGENT_MODELS["orchestrator"];
    const agentPriorities = await _getAgentPriorities();
    const writeMutex = new WriteMutex();
    const orchSessionKey = _sessionKey("orchestrator", taskId);

    const installedSkillNames = await _scanInstalledSkillNames();

    // Phase 1: Planning
    _emitAgentStatus(mainWindow, "orchestrator", "running", "Planning task delegation...");

    const planningText = await buildPlanningPrompt(goal, installedSkillNames);
    console.log(`[orchestrator] Phase 1: planning (model=${orchestratorModel}, session=${orchSessionKey})`);
    let planText;
    {
      const { result } = await _spawnSession("orchestrator", planningText, orchestratorModel, 120_000, orchSessionKey);
      planText = _sanitizeAgentResult(result);
    }
    console.log(`[orchestrator] Phase 1 response (${planText?.length ?? 0} chars):\n---\n${planText?.slice(0, 1000) || "(empty)"}\n---`);

    // Phase 2: Parse
    const clarifyQuestion = _parseClarify(planText);
    if (clarifyQuestion) {
      console.log(`[orchestrator] Phase 2: CLARIFY — "${clarifyQuestion}"`);
      _emitAgentStatus(mainWindow, "orchestrator", "idle", null);
      await _updateTask(supabase, taskId, { status: "awaiting_input", result: clarifyQuestion });
      await _updateBuild(supabase, buildId, { status: "running", output: clarifyQuestion }, buildRowInDb);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("task:awaiting-input", { taskId, question: clarifyQuestion });
      }
      _activeTasks.delete(taskId);
      return;
    }

    const knownAgentIds = Object.keys(agentModels).filter((id) => id !== "orchestrator");
    let plan = _parsePlan(planText);

    if (!plan) {
      console.log("[orchestrator] Phase 2: strict parsing failed — trying fuzzy");
      plan = _parsePlanFuzzy(planText, knownAgentIds);
    }

    if (!plan) {
      console.log("[orchestrator] Phase 2: fuzzy failed — retrying with simplified prompt");
      _emitAgentStatus(mainWindow, "orchestrator", "running", "Retrying delegation plan...");
      const retryPrompt =
        `Split this goal into tasks for your agents: ${knownAgentIds.join(", ")}\n\n` +
        `Output format (one per line, no other text):\n` +
        `DELEGATE(agentId): task description\n\n` +
        `Goal: ${goal}`;
      try {
        const { result: retryText } = await _spawnSession("orchestrator", retryPrompt, orchestratorModel, 60_000, orchSessionKey);
        const sanitizedRetry = _sanitizeAgentResult(retryText);
        plan = _parsePlan(sanitizedRetry) || _parsePlanFuzzy(sanitizedRetry, knownAgentIds);
        if (plan) console.log(`[orchestrator] Phase 2: retry succeeded — ${plan.delegates.length} delegate(s)`);
      } catch (retryErr) {
        console.error("[orchestrator] Phase 2: retry failed:", retryErr.message);
      }
    }

    if (!plan) {
      const question = planText || "I need more information. What would you like me to accomplish?";
      console.log("[orchestrator] Phase 2: all parsing failed — surfacing as consultation");
      _emitAgentStatus(mainWindow, "orchestrator", "idle", null);
      await _updateTask(supabase, taskId, { status: "awaiting_input", result: question });
      await _updateBuild(supabase, buildId, { status: "running", output: question }, buildRowInDb);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("task:awaiting-input", { taskId, question });
      }
      _activeTasks.delete(taskId);
      return;
    }

    console.log(`[orchestrator] Phase 2: plan="${plan.plan}", delegates=${plan.delegates.map((d) => d.agentId).join(", ")}`);
    if (plan.depends.size > 0) {
      const depStr = [...plan.depends.entries()].map(([k, v]) => `${k}->${v.join(",")}`).join("; ");
      console.log(`[orchestrator] Phase 2: dependencies: ${depStr}`);
    }

    // Phase 3: Delegate
    _emitAgentStatus(
      mainWindow, "orchestrator", "running",
      `Delegating to ${plan.delegates.length} agent(s): ${plan.delegates.map((d) => d.agentId).join(", ")}`
    );

    const baseTaskData = { taskId, buildId, goal, plan: plan.plan, metadata: metadata || {} };

    const agentResults = await _executeWithDependencies(
      plan.delegates,
      plan.depends,
      baseTaskData,
      agentModels,
      mainWindow,
      installedSkillNames,
      writeMutex,
      agentPriorities,
    );

    // Phase 4: Synthesize
    _emitAgentStatus(mainWindow, "orchestrator", "running", "Synthesizing agent results...");

    const resultSections = plan.delegates.map((d) => {
      const r = agentResults.get(d.agentId) || "(no output)";
      return `### ${d.agentId}\n${r}`;
    });

    const synthesisPrompt =
      `Agent results:\n\n${resultSections.join("\n\n---\n\n")}\n\n` +
      `Original goal: "${goal}"`;

    let finalResult = resultSections.join("\n\n");

    console.log("[orchestrator] Phase 4: synthesis");
    try {
      const { result: synthesized } = await _spawnSession("orchestrator", synthesisPrompt, orchestratorModel, 120_000, orchSessionKey);
      console.log(`[orchestrator] Phase 4: ${synthesized?.length ?? 0} chars`);
      finalResult = synthesized || finalResult;
    } catch (err) {
      console.error("[orchestrator] synthesis failed:", err.message);
    }

    _emitAgentStatus(mainWindow, "orchestrator", "idle", null);

    // If synthesis contains a CLARIFY directive the orchestrator needs more info
    // before the work is complete — surface it as an input request, not approval.
    const synthesisClarify = _parseClarify(finalResult);
    if (synthesisClarify) {
      console.log(`[orchestrator] Phase 4: synthesis CLARIFY — "${synthesisClarify.slice(0, 120)}"`);
      await _updateTask(supabase, taskId, { status: "awaiting_input", result: synthesisClarify });
      await _updateBuild(supabase, buildId, { status: "running", output: synthesisClarify }, buildRowInDb);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("task:awaiting-input", { taskId, question: synthesisClarify });
      }
      _activeTasks.delete(taskId);
      return;
    }

    await _requestApproval(supabase, taskId, buildId, finalResult, userId, mainWindow, buildRowInDb);
  } catch (err) {
    console.error("[orchestrator] pipeline error:", err.message);

    _emitAgentStatus(mainWindow, "orchestrator", "idle", null);
    for (const id of Object.keys(await _getAgentModels())) {
      if (id !== "orchestrator") _emitAgentStatus(mainWindow, id, "idle", null);
    }

    const failedAt = new Date().toISOString();
    const entry = _activeTasks.get(taskId);

    const isQuota = err instanceof QuotaExhaustedError || detectQuotaError(err).isQuotaError;

    if (isQuota) {
      const { provider, errorType } =
        err instanceof QuotaExhaustedError ? err : detectQuotaError(err);

      const checkpoint = {
        phase: err.phase || "unknown",
        completedAgents: err.completedAgents || [],
        partialResults: err.partialResults ? Object.fromEntries(err.partialResults) : {},
        goal,
        buildId: entry?.buildId || buildId,
        pausedAt: failedAt,
      };

      await _updateTask(getSupabase(), taskId, { status: "quota_exhausted", result: JSON.stringify(checkpoint) });
      await _updateBuild(getSupabase(), entry?.buildId || buildId, { status: "paused" }, buildRowInDb);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("task:quota-exhausted", {
          taskId, buildId: entry?.buildId || buildId, provider, errorType, message: err.message,
        });
      }
      return;
    }

    await _updateTask(getSupabase(), taskId, { status: "failed", result: err.message, completed_at: failedAt });
    await _updateBuild(getSupabase(), entry?.buildId || buildId, { status: "failed", completed_at: failedAt }, buildRowInDb);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("task:failed", { taskId, error: err.message });
    }
  } finally {
    const isStillQuotaPaused =
      _activeTasks.has(taskId) && (await _getTaskStatus(taskId)) === "quota_exhausted";
    if (!isStillQuotaPaused) {
      _activeTasks.delete(taskId);
    }
  }
}

/**
 * Get current task status from Supabase (used in finally block).
 * @param {string} taskId
 * @returns {Promise<string|null>}
 */
async function _getTaskStatus(taskId) {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("tasks")
      .select("status")
      .eq("id", taskId)
      .maybeSingle();
    return data?.status || null;
  } catch (_) {
    return null;
  }
}

/**
 * Resume a quota-paused task from its saved checkpoint.
 *
 * @param {{ taskId: string, mainWindow: Electron.BrowserWindow, userId: string }} opts
 */
async function resume({ taskId, mainWindow, userId }) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase not configured");

  const { data: task, error: fetchErr } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!task) throw new Error("Task not found");
  if (task.status !== "quota_exhausted") throw new Error("Task is not in quota_exhausted state");

  let checkpoint = {};
  try {
    checkpoint = JSON.parse(task.result || "{}");
  } catch (_) {
    checkpoint = {};
  }

  const goal = checkpoint.goal || task.goal;
  const buildId = checkpoint.buildId || uuidv4();
  const completedAgentIds = new Set(checkpoint.completedAgents || []);
  const savedPartialResults = new Map(Object.entries(checkpoint.partialResults || {}));

  _activeTasks.set(taskId, { buildId });

  await _updateTask(supabase, taskId, { status: "running", result: null });
  await _updateBuild(supabase, buildId, { status: "running" }, true);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("task:started", { taskId, goal });
  }

  try {
    const agentModels = await _getAgentModels();
    const orchestratorModel = agentModels["orchestrator"] || DEFAULT_AGENT_MODELS["orchestrator"];
    const agentPriorities = await _getAgentPriorities();
    const writeMutex = new WriteMutex();
    const orchSessionKey = _sessionKey("orchestrator", taskId);

    const installedSkillNames = await _scanInstalledSkillNames();

    const planningText = await buildPlanningPrompt(goal, installedSkillNames);
    const { result: planText } = await _spawnSession("orchestrator", planningText, orchestratorModel, 120_000, orchSessionKey);

    const plan = _parsePlan(planText);
    if (!plan) {
      await _requestApproval(supabase, taskId, buildId, planText, userId, mainWindow, true);
      return;
    }

    const remainingDelegates = plan.delegates.filter((d) => !completedAgentIds.has(d.agentId));

    const baseTaskData = { taskId, buildId, goal, plan: plan.plan, metadata: {} };

    const agentResults = await _executeWithDependenciesFromCheckpoint(
      remainingDelegates,
      plan.depends,
      baseTaskData,
      agentModels,
      savedPartialResults,
      mainWindow,
      installedSkillNames,
      writeMutex,
      agentPriorities,
    );

    const allDelegates = plan.delegates;
    const resultSections = allDelegates.map((d) => {
      const r = agentResults.get(d.agentId) || "(no output)";
      return `### ${d.agentId}\n${r}`;
    });

    const synthesisPrompt =
      `Agent results:\n\n${resultSections.join("\n\n---\n\n")}\n\n` +
      `Original goal: "${goal}"`;

    let finalResult = resultSections.join("\n\n");
    try {
      const { result: synthesized } = await _spawnSession("orchestrator", synthesisPrompt, orchestratorModel, 120_000, orchSessionKey);
      finalResult = synthesized || finalResult;
    } catch (synthErr) {
      console.error("[orchestrator] resume synthesis failed:", synthErr.message);
    }

    const resumeSynthesisClarify = _parseClarify(finalResult);
    if (resumeSynthesisClarify) {
      console.log(`[orchestrator] resume Phase 4: synthesis CLARIFY — "${resumeSynthesisClarify.slice(0, 120)}"`);
      await _updateTask(supabase, taskId, { status: "awaiting_input", result: resumeSynthesisClarify });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("task:awaiting-input", { taskId, question: resumeSynthesisClarify });
      }
      _activeTasks.delete(taskId);
      return;
    }

    await _requestApproval(supabase, taskId, buildId, finalResult, userId, mainWindow, true);
  } catch (err) {
    console.error("[orchestrator] resume pipeline error:", err.message);
    const failedAt = new Date().toISOString();

    const isQuota = err instanceof QuotaExhaustedError || detectQuotaError(err).isQuotaError;
    if (isQuota) {
      const { provider, errorType } = err instanceof QuotaExhaustedError ? err : detectQuotaError(err);
      const checkpoint2 = {
        phase: err.phase || "unknown",
        completedAgents: err.completedAgents || [],
        partialResults: err.partialResults ? Object.fromEntries(err.partialResults) : {},
        goal, buildId, pausedAt: failedAt,
      };
      await _updateTask(supabase, taskId, { status: "quota_exhausted", result: JSON.stringify(checkpoint2) });
      await _updateBuild(supabase, buildId, { status: "paused" }, true);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("task:quota-exhausted", { taskId, buildId, provider, errorType, message: err.message });
      }
      return;
    }

    await _updateTask(supabase, taskId, { status: "failed", result: err.message, completed_at: failedAt });
    await _updateBuild(supabase, buildId, { status: "failed", completed_at: failedAt }, true);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("task:failed", { taskId, error: err.message });
    }
  } finally {
    _activeTasks.delete(taskId);
  }
}

/**
 * Like `_executeWithDependencies` but pre-seeded with checkpoint results.
 * Only runs agents that are NOT already in `initialResults`.
 */
async function _executeWithDependenciesFromCheckpoint(
  delegates,
  depends,
  baseTaskData,
  models,
  initialResults,
  mainWindow = null,
  installedSkillNames = [],
  writeMutex = null,
  priorities = {},
) {
  const results = new Map(initialResults);
  const completed = new Set(initialResults.keys());

  function getReadyDelegates() {
    return delegates.filter((d) => {
      if (completed.has(d.agentId)) return false;
      const prereqs = depends.get(d.agentId) || [];
      return prereqs.every((p) => completed.has(p));
    });
  }

  while (completed.size < delegates.length + initialResults.size) {
    let wave = getReadyDelegates();
    if (wave.length === 0) {
      wave = delegates.filter((d) => !completed.has(d.agentId));
    }
    if (wave.length === 0) break;

    // Sort by priority within the wave
    wave.sort((a, b) => {
      const pa = PRIORITY_ORDER[priorities?.[a.agentId] ?? "normal"] ?? 2;
      const pb = PRIORITY_ORDER[priorities?.[b.agentId] ?? "normal"] ?? 2;
      return pa - pb;
    });

    const waveSettled = await Promise.allSettled(
      wave.map(async (delegate) => {
        const prereqResults = {};
        for (const prereqId of depends.get(delegate.agentId) || []) {
          if (results.has(prereqId)) prereqResults[prereqId] = results.get(prereqId);
        }
        const peerResults = {};
        for (const [completedId, completedResult] of results.entries()) {
          if (completedId !== delegate.agentId) peerResults[completedId] = completedResult;
        }
        const taskFileData = {
          ...baseTaskData,
          agentId: delegate.agentId,
          instruction: delegate.instruction,
          prerequisiteResults: prereqResults,
          peerResults,
          issuedAt: new Date().toISOString(),
        };
        const model = models?.[delegate.agentId] || DEFAULT_AGENT_MODELS[delegate.agentId] || "gemini/gemini-2.0-flash";
        const timeoutMs = _isLocalModel(model) ? TIMEOUT_LOCAL_MS : TIMEOUT_CLOUD_MS;
        const sk = _sessionKey(delegate.agentId, baseTaskData.taskId);
        const result = await _dispatchAgent(
          delegate.agentId, delegate.instruction, taskFileData, model,
          timeoutMs, mainWindow, installedSkillNames, writeMutex, sk,
        );
        return { agentId: delegate.agentId, result };
      }),
    );

    for (let i = 0; i < wave.length; i++) {
      const agentId = wave[i].agentId;
      const outcome = waveSettled[i];
      if (outcome.status === "fulfilled") {
        results.set(agentId, outcome.value.result);
      } else {
        const errMsg = outcome.reason?.message || "Agent failed";
        const { isQuotaError, provider, errorType } = detectQuotaError(errMsg);
        if (isQuotaError) {
          throw new QuotaExhaustedError(errMsg, {
            provider, errorType,
            partialResults: new Map(results),
            phase: "delegation",
            completedAgents: Array.from(completed),
          });
        }
        results.set(agentId, `ERROR: ${errMsg}`);
      }
      completed.add(agentId);
    }
  }

  return results;
}

/**
 * Return the active build for a task (used by task:cancel).
 * @param {string} taskId
 * @returns {{ id: string }|null}
 */
function getActiveBuildForTask(taskId) {
  const entry = _activeTasks.get(taskId);
  return entry ? { id: entry.buildId } : null;
}

module.exports = { execute, resume, getActiveBuildForTask };

/* istanbul ignore next */
if (process.env.NODE_ENV === "test") {
  module.exports._internals = {
    _parseQueryAgentDirectives,
    _parseNeedsContextFrom,
    _parseNeedsWrite,
    WriteMutex,
    PRIORITY_ORDER,
    MAX_DIRECTIVE_ROUNDS,
  };
}
