#!/usr/bin/env node
"use strict";

/**
 * Mock OpenClaw Gateway Server
 *
 * A standalone development server that simulates the OpenClaw Gateway daemon.
 * Run with: node electron/dev/mockGateway.js
 *
 * Listens on ws://127.0.0.1:18789 (or the port specified by MOCK_GATEWAY_PORT env).
 * Simulates realistic multi-agent behavior with per-agent concurrent execution.
 *
 * Supports the app-driven coordination protocol:
 * - chat.send to orchestrator → returns DELEGATE directives
 * - chat.send to individual agents → returns focused results
 * - chat.send to orchestrator with "Agent results:" → returns synthesized deliverable
 */

const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

const PORT = parseInt(process.env.MOCK_GATEWAY_PORT || "18789", 10);

// =============================================================================
// PRESET AGENT DEFINITIONS
// =============================================================================

const AGENTS = [
  {
    id: "orchestrator",
    name: "Orchestrator",
    role: "CEO & Task Router",
    model: "gemini/gemini-1.5-pro",
  },
  {
    id: "pm",
    name: "Project Manager",
    role: "Planning & Specification",
    model: "gemini/gemini-2.0-flash",
  },
  {
    id: "coder",
    name: "Coder",
    role: "Software Engineering",
    model: "gemini/gemini-2.0-flash",
  },
  {
    id: "qa",
    name: "QA Engineer",
    role: "Testing & Validation",
    model: "gemini/gemini-2.0-flash",
  },
  {
    id: "cybersec",
    name: "CyberSec",
    role: "Security Audit",
    model: "gemini/gemini-2.0-flash",
  },
  {
    id: "design",
    name: "Designer",
    role: "UI/UX & Visual Design",
    model: "gemini/gemini-2.0-flash",
  },
  {
    id: "marketing",
    name: "Marketing",
    role: "Copywriting & Growth",
    model: "gemini/gemini-2.0-flash",
  },
  {
    id: "research",
    name: "Research",
    role: "Market Intelligence",
    model: "gemini/gemini-2.0-flash",
  },
  {
    id: "patrol",
    name: "Patrol",
    role: "Watchdog & Recovery",
    model: "gemini/gemini-2.0-flash",
  },
];

// =============================================================================
// MOCK AGENT RESPONSES
// =============================================================================

const AGENT_RESPONSES = {
  pm: (instruction) =>
    `Technical specification complete for: ${instruction}\n` +
    "- 4 endpoints defined with acceptance criteria\n" +
    "- Architecture: layered MVC with service layer\n" +
    "- Dependencies identified: auth middleware, validation library\n" +
    "- Estimated complexity: Medium (3-5 days)",

  coder: (instruction) =>
    `Implementation complete for: ${instruction}\n` +
    "- Created Express route handlers with input validation\n" +
    "- JWT authentication middleware with RS256 signing\n" +
    "- Database migrations for users table\n" +
    "- Unit tests: 14 passing\n" +
    "- Code follows project conventions and ESLint rules",

  qa: (instruction) =>
    `Testing complete for: ${instruction}\n` +
    "- Unit tests: 14/14 passing\n" +
    "- Integration tests: 8/8 passing\n" +
    "- Edge cases tested: empty input, malformed tokens, expired sessions\n" +
    "- Code coverage: 87%\n" +
    "- No regressions detected",

  cybersec: (instruction) =>
    `Security audit complete for: ${instruction}\n` +
    "- OWASP Top 10 scan: PASS\n" +
    "- SQL injection: No vulnerabilities found (parameterized queries used)\n" +
    "- XSS: No vulnerabilities found (output sanitized)\n" +
    "- Dependencies: 0 critical CVEs, 1 low-severity advisory (acceptable)\n" +
    "- JWT configuration: RS256 with proper key rotation\n" +
    "- Bcrypt rounds: 12 (meets minimum)",

  design: (instruction) =>
    `UI/UX design complete for: ${instruction}\n` +
    "- Wireframes created for all screens\n" +
    "- Design tokens applied from system\n" +
    "- Responsive layout: mobile + desktop\n" +
    "- Accessibility: WCAG 2.1 AA compliant",

  marketing: (instruction) =>
    `Copy and communications complete for: ${instruction}\n` +
    "- Page copy written with 3 A/B variants\n" +
    "- Microcopy for form validation messages\n" +
    "- Onboarding email sequence: 3 emails drafted\n" +
    "- Changelog entry prepared",

  research: (instruction) =>
    `Research complete for: ${instruction}\n` +
    "- Best practices documented from RFC standards\n" +
    "- Industry benchmarks analyzed\n" +
    "- Competitor approaches reviewed\n" +
    "- Recommendations deposited in shared memory",

  patrol: (instruction) =>
    `Monitoring report for: ${instruction}\n` +
    "- All agents healthy during execution\n" +
    "- No stuck tasks detected\n" +
    "- Memory usage nominal across all agents\n" +
    "- No anomalies in system metrics",
};

// =============================================================================
// MOCK STATUS MESSAGES (for real-time agent activity during execution)
// =============================================================================

const STATUS_MESSAGES = {
  orchestrator: [
    "Analyzing goal and decomposing into subtasks",
    "Reviewing agent capabilities for task assignment",
    "Preparing DELEGATE directives",
  ],
  pm: [
    "Drafting specification",
    "Defining acceptance criteria",
    "Estimating complexity",
  ],
  coder: [
    "Setting up project structure",
    "Writing implementation",
    "Running unit tests",
    "Refactoring",
  ],
  qa: [
    "Setting up test environment",
    "Running test suite",
    "Checking edge cases",
  ],
  cybersec: [
    "Running security scan",
    "Checking dependencies for CVEs",
    "Auditing configurations",
  ],
  design: [
    "Creating wireframes",
    "Applying design tokens",
    "Building responsive layout",
  ],
  marketing: [
    "Writing copy variants",
    "Drafting communications",
    "Preparing changelog",
  ],
  research: [
    "Searching primary sources",
    "Analyzing best practices",
    "Compiling findings",
  ],
  patrol: [
    "Monitoring agents",
    "Checking health metrics",
    "Scanning for anomalies",
  ],
};

// =============================================================================
// MOCK CHECKPOINT DATA
// =============================================================================

const CHECKPOINT_ACTIONS = [
  {
    agentId: "coder",
    action: "CODE_EXECUTION",
    riskLevel: "HIGH",
    command: "npm install express dotenv cors jsonwebtoken bcrypt",
    directory: "/workspace/coder/project-auth",
    affects: ["package.json", "node_modules/"],
    reason:
      "Installing runtime dependencies required for the Express API server.",
  },
  {
    agentId: "coder",
    action: "FILE_WRITE",
    riskLevel: "MEDIUM",
    command: "write src/middleware/auth.js",
    directory: "/workspace/coder/project-auth",
    affects: ["src/middleware/auth.js"],
    reason: "Creating the authentication middleware file.",
  },
  {
    agentId: "cybersec",
    action: "CODE_EXECUTION",
    riskLevel: "LOW",
    command: "npx eslint --plugin security src/**/*.js",
    directory: "/workspace/coder/project-auth",
    affects: [],
    reason: "Running ESLint with the security plugin for static analysis.",
  },
];

// =============================================================================
// SERVER STATE
// =============================================================================

let seqCounter = 0;

/** @type {Map<string, { agentId: string, ws: WebSocket, timer: NodeJS.Timeout|null, goal: string }>} */
const activeRuns = new Map();

/** Per-client state for protocol v3 challenge-response */
const clientState = new WeakMap();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function nextSeq() {
  return ++seqCounter;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function timestamp() {
  return new Date().toISOString();
}

// =============================================================================
// WEBSOCKET SERVER
// =============================================================================

const wss = new WebSocket.Server({ host: "127.0.0.1", port: PORT });

wss.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[MockGateway] Port ${PORT} is already in use (EADDRINUSE).`);
    console.error(
      "  Only one process can listen on this port. Common cases:\n" +
        "  • You already have mock-gateway or OpenClaw running in another terminal.\n" +
        "  • Stop the other process, or pick another port.\n" +
        `  • macOS/Linux — see what is listening:  lsof -iTCP:${PORT} -sTCP:LISTEN\n` +
        "  • Use another port:  MOCK_GATEWAY_PORT=18790 npm run mock-gateway\n" +
        "    Then set HiveMind Settings → Gateway URL to ws://127.0.0.1:18790 (same port).",
    );
  } else {
    console.error("[MockGateway] WebSocket server error:", err.message);
  }
  process.exit(1);
});

wss.on("listening", () => {
  const addr = wss.address();
  const port = typeof addr === "object" && addr ? addr.port : PORT;
  console.log(
    `[MockGateway] OpenClaw Mock Gateway listening on ws://127.0.0.1:${port}`,
  );
  console.log("[MockGateway] Waiting for HiveMind OS to connect...");
});

wss.on("connection", (ws) => {
  console.log("[MockGateway] Client connected");

  // Protocol v3: Send challenge immediately on connection
  const nonce = uuidv4();
  const state = { authenticated: false, nonce, tickTimer: null };
  clientState.set(ws, state);

  sendEvent(ws, "connect.challenge", {
    nonce,
    ts: Date.now(),
    protocols: [3],
  });
  console.log(
    "[MockGateway] Sent connect.challenge (nonce:",
    nonce.slice(0, 8) + "...)",
  );

  ws.on("message", (raw) => {
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch (err) {
      console.error(
        "[MockGateway] Invalid JSON received:",
        raw.toString().slice(0, 200),
      );
      return;
    }

    // Handle tick.pong responses from client (keepalive ack)
    if (frame.type === "event" && frame.event === "tick.pong") {
      return;
    }

    if (frame.type !== "req") {
      console.log("[MockGateway] Ignoring non-request frame:", frame.type);
      return;
    }

    console.log(`[MockGateway] Request: ${frame.method} (id: ${frame.id})`);

    // -------------------------------------------------------------------------
    // CONNECT — mandatory first frame (supports both v1.0 and v3)
    // -------------------------------------------------------------------------
    if (frame.method === "connect") {
      state.authenticated = true;

      const isV3 =
        frame.params?.minProtocol >= 3 || frame.params?.maxProtocol >= 3;

      if (isV3) {
        sendResponse(ws, frame.id, true, {
          type: "hello-ok",
          protocol: 3,
          gateway: "mock",
          policy: { tickIntervalMs: 15000 },
          agents: AGENTS.length,
          timestamp: timestamp(),
        });
        console.log("[MockGateway] Client authenticated (protocol v3)");

        state.tickTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            sendEvent(ws, "tick", { timestamp: timestamp(), seq: nextSeq() });
          } else {
            clearInterval(state.tickTimer);
            state.tickTimer = null;
          }
        }, 15000);
      } else {
        sendResponse(ws, frame.id, true, {
          version: "1.0.0",
          gateway: "mock",
          agents: AGENTS.length,
          timestamp: timestamp(),
        });
        console.log("[MockGateway] Client authenticated (protocol v1.0)");
      }
      return;
    }

    // Reject all requests if not authenticated
    if (!state.authenticated) {
      sendResponse(
        ws,
        frame.id,
        false,
        null,
        "Not authenticated. Send connect frame first.",
      );
      ws.close(4001, "Authentication required");
      return;
    }

    // -------------------------------------------------------------------------
    // AGENT.LIST
    // -------------------------------------------------------------------------
    if (frame.method === "agent.list") {
      sendResponse(ws, frame.id, true, {
        agents: AGENTS.map((a) => ({
          ...a,
          status: isAgentBusy(a.id) ? "running" : "idle",
          currentAction: "",
          taskCount: 0,
        })),
      });
      return;
    }

    // -------------------------------------------------------------------------
    // AGENT.GET
    // -------------------------------------------------------------------------
    if (frame.method === "agent.get") {
      const agent = AGENTS.find((a) => a.id === frame.params?.agentId);
      if (!agent) {
        sendResponse(
          ws,
          frame.id,
          false,
          null,
          `Agent not found: ${frame.params?.agentId}`,
        );
        return;
      }
      sendResponse(ws, frame.id, true, {
        ...agent,
        status: isAgentBusy(agent.id) ? "running" : "idle",
        currentAction: "",
        taskCount: 0,
      });
      return;
    }

    // -------------------------------------------------------------------------
    // AGENT.START / AGENT.STOP / AGENT.RESTART
    // -------------------------------------------------------------------------
    if (
      frame.method === "agent.start" ||
      frame.method === "agent.stop" ||
      frame.method === "agent.restart"
    ) {
      sendResponse(ws, frame.id, true, {
        agentId: frame.params?.agentId,
        status: frame.method === "agent.stop" ? "idle" : "running",
      });
      return;
    }

    // -------------------------------------------------------------------------
    // AGENT.REGISTER / AGENT.UNREGISTER / AGENT.UPDATE_CONFIG
    // -------------------------------------------------------------------------
    if (
      frame.method === "agent.register" ||
      frame.method === "agent.unregister" ||
      frame.method === "agent.update_config"
    ) {
      sendResponse(ws, frame.id, true, { ok: true });
      return;
    }

    // -------------------------------------------------------------------------
    // SESSIONS.SPAWN — Create an isolated background session for a task.
    // Equivalent to: openclaw sessions spawn --task "..." --model "..."
    // Returns childSessionKey + runId immediately; emits chat completion when done.
    // -------------------------------------------------------------------------
    if (frame.method === "sessions.spawn") {
      const runId = uuidv4();
      const agentId = frame.params?.agentId || "orchestrator";
      const task = frame.params?.task || "";
      const model = frame.params?.model || "gemini/gemini-2.0-flash";
      const childSessionKey = `${agentId}-${runId.slice(0, 8)}`;

      sendResponse(ws, frame.id, true, {
        childSessionKey,
        runId,
        status: "started",
        model,
      });

      console.log(
        `[MockGateway] sessions.spawn → ${agentId} (runId: ${runId.slice(0, 8)}..., model: ${model})`,
      );

      startAgentRun(ws, runId, agentId, task);
      return;
    }

    // -------------------------------------------------------------------------
    // CHAT.SEND — Per-agent execution (supports concurrent runs)
    // -------------------------------------------------------------------------
    if (frame.method === "chat.send") {
      const runId = uuidv4();
      const rawKey =
        frame.params?.sessionKey || frame.params?.agentId || "orchestrator";
      const agentMatch = String(rawKey).match(/^agent:([\w-]+):/);
      const agentId = agentMatch ? agentMatch[1] : rawKey;
      const text = frame.params?.message || frame.params?.text || "";

      sendResponse(ws, frame.id, true, {
        runId,
        status: "started",
      });

      console.log(
        `[MockGateway] chat.send → ${agentId} (runId: ${runId.slice(0, 8)}...)`,
      );

      // Start agent-specific simulation
      startAgentRun(ws, runId, agentId, text);
      return;
    }

    // -------------------------------------------------------------------------
    // CHAT.RESET — Clear session history for a given sessionKey (per-task isolation)
    // -------------------------------------------------------------------------
    if (frame.method === "chat.reset") {
      const sessionKey = frame.params?.sessionKey || "unknown";
      console.log(`[MockGateway] chat.reset → sessionKey: ${sessionKey} (history cleared)`);
      sendResponse(ws, frame.id, true, { sessionKey, cleared: true });
      return;
    }

    // -------------------------------------------------------------------------
    // CHAT.ABORT — Cancel a specific run
    // -------------------------------------------------------------------------
    if (frame.method === "chat.abort") {
      const runId = frame.params?.runId;
      const run = runId ? activeRuns.get(runId) : null;

      if (run) {
        if (run.timer) clearTimeout(run.timer);
        activeRuns.delete(runId);

        // Emit agent idle status
        sendEvent(ws, "agent", {
          agentId: run.agentId,
          type: "status",
          content: { status: "idle", currentAction: "Aborted" },
        });
      }

      sendResponse(ws, frame.id, true, {
        runId: runId || null,
        status: "aborted",
      });

      // Emit chat failure event so the bridge resolves the waiter
      sendEvent(ws, "chat", {
        runId,
        status: "failed",
        error: "Aborted by user",
        timestamp: timestamp(),
      });

      console.log(
        `[MockGateway] chat.abort → runId: ${runId?.slice(0, 8) || "unknown"}...`,
      );
      return;
    }

    // -------------------------------------------------------------------------
    // CHECKPOINT.RESPOND
    // -------------------------------------------------------------------------
    if (frame.method === "checkpoint.respond") {
      const approved = frame.params?.approved;
      console.log(
        `[MockGateway] Checkpoint ${approved ? "APPROVED" : "REJECTED"}: ${frame.params?.checkpointId}`,
      );
      sendResponse(ws, frame.id, true, {
        checkpointId: frame.params?.checkpointId,
        decision: approved ? "approved" : "rejected",
        decidedAt: timestamp(),
      });

      if (!approved) {
        const checkpointAction = CHECKPOINT_ACTIONS.find(
          (c) => c.agentId === (frame.params?.agentId || "coder"),
        );
        if (checkpointAction) {
          sendEvent(ws, "agent", {
            agentId: checkpointAction.agentId,
            type: "status",
            content: {
              status: "error",
              currentAction: `Checkpoint rejected: ${frame.params?.reason || "User denied request"}`,
            },
          });
        }
      }
      return;
    }

    // -------------------------------------------------------------------------
    // DEFAULT — unknown method
    // -------------------------------------------------------------------------
    sendResponse(ws, frame.id, false, null, `Unknown method: ${frame.method}`);
  });

  ws.on("close", () => {
    console.log("[MockGateway] Client disconnected");
    // Clean up all runs for this client
    for (const [runId, run] of activeRuns) {
      if (run.ws === ws) {
        if (run.timer) clearTimeout(run.timer);
        activeRuns.delete(runId);
      }
    }
    const s = clientState.get(ws);
    if (s?.tickTimer) {
      clearInterval(s.tickTimer);
      s.tickTimer = null;
    }
  });

  ws.on("error", (err) => {
    console.error("[MockGateway] WebSocket error:", err.message);
  });
});

// =============================================================================
// RESPONSE / EVENT HELPERS
// =============================================================================

function sendResponse(ws, id, ok, payload, error) {
  if (ws.readyState !== WebSocket.OPEN) return;
  const frame = { type: "res", id, ok };
  if (ok) {
    frame.payload = payload || {};
  } else {
    frame.error = error || "Unknown error";
  }
  ws.send(JSON.stringify(frame));
}

function sendEvent(ws, event, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(
    JSON.stringify({
      type: "event",
      event,
      payload,
      seq: nextSeq(),
    }),
  );
}

/**
 * Check if an agent has any active runs.
 */
function isAgentBusy(agentId) {
  for (const run of activeRuns.values()) {
    if (run.agentId === agentId) return true;
  }
  return false;
}

// =============================================================================
// PER-AGENT RUN SIMULATION
// =============================================================================

/**
 * Start a simulated agent run. The agent will emit status updates during
 * processing and then emit a chat completion event with the result.
 */
function startAgentRun(ws, runId, agentId, text) {
  // Emit agent status: running
  sendEvent(ws, "agent", {
    agentId,
    type: "status",
    content: { status: "running", currentAction: "Processing request..." },
  });

  if (agentId === "orchestrator") {
    startOrchestratorRun(ws, runId, text);
  } else {
    startWorkerAgentRun(ws, runId, agentId, text);
  }
}

/**
 * Orchestrator run: detect if this is a planning request or synthesis request.
 */
function startOrchestratorRun(ws, runId, text) {
  const isSynthesis =
    text.includes("Agent results:") || text.includes("Synthesize");
  const delayMs = isSynthesis ? randomInt(2000, 4000) : randomInt(2000, 5000);

  // Emit status updates during "thinking"
  const messages = STATUS_MESSAGES.orchestrator;
  let msgIdx = 0;
  const statusInterval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN || !activeRuns.has(runId)) {
      clearInterval(statusInterval);
      return;
    }
    sendEvent(ws, "agent", {
      agentId: "orchestrator",
      type: "status",
      content: {
        status: "running",
        currentAction: messages[msgIdx % messages.length],
      },
    });
    msgIdx++;
  }, 800);

  const timer = setTimeout(() => {
    clearInterval(statusInterval);
    if (ws.readyState !== WebSocket.OPEN || !activeRuns.has(runId)) return;
    activeRuns.delete(runId);

    let result;
    if (isSynthesis) {
      result = generateSynthesisResponse(text);
    } else {
      result = generateDelegateDirectives(text);
    }

    // Emit completion
    sendEvent(ws, "chat", {
      runId,
      status: "completed",
      result,
      timestamp: timestamp(),
    });

    sendEvent(ws, "agent", {
      agentId: "orchestrator",
      type: "status",
      content: { status: "idle", currentAction: null },
    });

    console.log(
      `[MockGateway] orchestrator run complete (runId: ${runId.slice(0, 8)}...)`,
    );
  }, delayMs);

  activeRuns.set(runId, { agentId: "orchestrator", ws, timer, goal: text });
}

/**
 * Worker agent run: emit status updates then complete with a focused result.
 */
function startWorkerAgentRun(ws, runId, agentId, instruction) {
  const delayMs = randomInt(3000, 8000);

  // Emit status updates during work
  const messages = STATUS_MESSAGES[agentId] || ["Processing..."];
  let msgIdx = 0;
  const statusInterval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN || !activeRuns.has(runId)) {
      clearInterval(statusInterval);
      return;
    }
    sendEvent(ws, "agent", {
      agentId,
      type: "status",
      content: {
        status: "running",
        currentAction: messages[msgIdx % messages.length],
      },
    });

    // Also emit chat progress
    sendEvent(ws, "chat", {
      runId,
      type: "progress",
      progress: Math.min(
        Math.round(((msgIdx + 1) / (delayMs / 1000)) * 100),
        90,
      ),
      timestamp: timestamp(),
    });

    msgIdx++;
  }, 1000);

  // Occasionally emit a checkpoint for high-risk agents
  let checkpointTimer = null;
  if ((agentId === "coder" || agentId === "cybersec") && Math.random() < 0.3) {
    checkpointTimer = setTimeout(
      () => {
        if (ws.readyState !== WebSocket.OPEN || !activeRuns.has(runId)) return;
        const action = randomChoice(
          CHECKPOINT_ACTIONS.filter((c) => c.agentId === agentId),
        );
        if (action) {
          sendEvent(ws, "agent", {
            agentId: action.agentId,
            type: "security_checkpoint",
            checkpointId: uuidv4(),
            action: action.action,
            riskLevel: action.riskLevel,
            command: action.command,
            directory: action.directory,
            affects: action.affects,
            reason: action.reason,
            timestamp: timestamp(),
          });
        }
      },
      randomInt(1500, delayMs - 500),
    );
  }

  const timer = setTimeout(() => {
    clearInterval(statusInterval);
    if (checkpointTimer) clearTimeout(checkpointTimer);
    if (ws.readyState !== WebSocket.OPEN || !activeRuns.has(runId)) return;
    activeRuns.delete(runId);

    const responseFn = AGENT_RESPONSES[agentId];
    const result = responseFn
      ? responseFn(instruction)
      : `Agent ${agentId} completed: ${instruction}`;

    // Emit completion
    sendEvent(ws, "chat", {
      runId,
      status: "completed",
      result,
      timestamp: timestamp(),
    });

    sendEvent(ws, "agent", {
      agentId,
      type: "status",
      content: { status: "idle", currentAction: null },
    });

    console.log(
      `[MockGateway] ${agentId} run complete (runId: ${runId.slice(0, 8)}...)`,
    );
  }, delayMs);

  activeRuns.set(runId, { agentId, ws, timer, goal: instruction });
}

// =============================================================================
// ORCHESTRATOR RESPONSE GENERATORS
// =============================================================================

/**
 * Generate DELEGATE directives based on the goal.
 */
function generateDelegateDirectives(goal) {
  return (
    `PLAN: Execute goal — ${goal.slice(0, 100)}\n` +
    `DELEGATE(pm): Write technical specification for: ${goal}\n` +
    `DELEGATE(coder): Implement the solution for: ${goal}\n` +
    `DELEGATE(qa): Write and run tests for: ${goal}\n` +
    `DELEGATE(cybersec): Security audit the implementation for: ${goal}\n` +
    `DEPENDS: coder->pm, qa->coder, cybersec->coder`
  );
}

/**
 * Generate a synthesis response from agent results.
 */
function generateSynthesisResponse(text) {
  return (
    "# Task Completed Successfully\n\n" +
    "## Summary\n" +
    "All delegated agents have completed their work. Here is the synthesized deliverable:\n\n" +
    "### Specification\n" +
    "Technical spec written with acceptance criteria and architecture decisions.\n\n" +
    "### Implementation\n" +
    "Code implemented following project conventions with full test coverage.\n\n" +
    "### Quality Assurance\n" +
    "All tests passing (22/22). Code coverage at 87%. No regressions.\n\n" +
    "### Security\n" +
    "OWASP Top 10 audit passed. No critical vulnerabilities. Dependencies clean.\n\n" +
    "## Status: COMPLETE\n" +
    "All subtasks delivered successfully. Ready for human review."
  );
}

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

process.on("SIGINT", () => {
  console.log("\n[MockGateway] Shutting down...");
  for (const [, run] of activeRuns) {
    if (run.timer) clearTimeout(run.timer);
  }
  activeRuns.clear();
  wss.close(() => {
    console.log("[MockGateway] Server closed");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  for (const [, run] of activeRuns) {
    if (run.timer) clearTimeout(run.timer);
  }
  activeRuns.clear();
  wss.close(() => process.exit(0));
});
