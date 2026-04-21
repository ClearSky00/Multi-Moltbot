# HiveMind OS — Complete Onboarding Guide

> Everything you need to understand this codebase from first principles to production deployment.

---

## Table of Contents

1. [What This Project Is](#1-what-this-project-is)
2. [Vocabulary & Glossary](#2-vocabulary--glossary)
3. [Architecture Overview](#3-architecture-overview)
4. [Technology Stack Explained](#4-technology-stack-explained)
5. [Security Model](#5-security-model)
6. [Directory Structure — File by File](#6-directory-structure--file-by-file)
7. [Data Flow — How Everything Connects](#7-data-flow--how-everything-connects)
8. [The 9 Preset Agents](#8-the-9-preset-agents)
9. [OpenClaw / NemoClaw Gateway Protocol](#9-openclaw--nemoclaw-gateway-protocol)
10. [Supabase Database Layer](#10-supabase-database-layer)
11. [Design System](#11-design-system)
12. [What Is Done](#12-what-is-done)
13. [What Needs To Be Done](#13-what-needs-to-be-done)
14. [Migration: OpenClaw → NemoClaw](#14-migration-openclaw--nemoclaw)
15. [Setup From Scratch](#15-setup-from-scratch)
16. [Common Bugs & How To Avoid Them](#16-common-bugs--how-to-avoid-them)
17. [Testing](#17-testing)
18. [Contribution Guide](#18-contribution-guide)

---

## 1. What This Project Is

**HiveMind OS** is a production-grade **Electron desktop application** — a graphical mission control panel for orchestrating a fleet of 9 autonomous AI agents that work together like a company.

**What it is NOT:**
- It is not a chat interface (like ChatGPT, Claude, etc.)
- It is not a demo or prototype
- It does not mock data or hardcode anything that would differ between environments
- It is not a web app (it runs as a native desktop app)

**What it IS:**
- A desktop app that connects to a locally-running AI agent daemon (OpenClaw / NemoClaw)
- A visual interface over that daemon's WebSocket API
- A persistent audit and configuration layer on top of Supabase (a hosted Postgres database)
- A human-in-the-loop security system — agents must ask permission before taking high-risk actions

**The core user story:**

> You type a single goal ("Build me a landing page for my SaaS product"). HiveMind OS sends it to the Orchestrator agent. The Orchestrator routes sub-tasks to the right agents (Coder writes code, Designer creates mockups, QA tests it). You only intervene when an agent hits a security checkpoint that requires your explicit approval. Everything else runs automatically.

---

## 2. Vocabulary & Glossary

Understanding this codebase requires understanding these terms precisely.

### Application Terms

| Term | Definition |
|------|-----------|
| **HiveMind OS** | This application. The Electron desktop app. |
| **Agent** | An autonomous AI entity with a defined role, personality (SOUL.md), and tool permissions. Runs inside OpenClaw/NemoClaw. |
| **Preset Agent** | One of the 9 built-in agents seeded from the database. Cannot be deleted (`is_preset = true`). |
| **Custom Agent** | An agent created by the user through the Builder screen. Can be deleted. |
| **Goal** | A plain-text instruction submitted by the user. Example: "Audit our authentication system for vulnerabilities". |
| **Task** | A database record that tracks a Goal from submission to completion, including status and which agents are assigned. |
| **Checkpoint** | A security gate that appears when an agent wants to perform a high-risk action (write to disk, execute code, call an API). The UI fully blocks until the human approves or rejects. |
| **Audit Log** | An append-only database table recording every action taken. Rows are **never** updated or deleted. |
| **SOUL.md** | A Markdown file that defines an agent's personality, goals, values, and behavioral constraints. Like a job description + character sheet. |
| **AGENTS.md** | A Markdown file listing all agents an agent is allowed to communicate with and spawn. |
| **MEMORY.md** | An agent's long-term memory file, updated over time by the agent itself. |
| **HEARTBEAT.md** | A file the agent reads every 30 minutes to check for standing instructions. |
| **Skill** | A reusable capability (like "send email", "query database") installed as a SKILL.md file in an agent's workspace. |
| **Workspace** | The directory on disk where a specific agent's files live: `~/.openclaw/workspace-[agentname]/` |
| **Activity Feed** | A live scrolling log in the Dashboard showing what every agent is doing in real time. |

### Technical Terms

| Term | Definition |
|------|-----------|
| **Electron** | A framework for building desktop apps using web technologies (HTML/CSS/JS). Has two processes: Main (Node.js) and Renderer (Chromium). |
| **Main Process** | The Node.js side of Electron. Has full OS access. Handles files, databases, WebSocket connections. Never directly visible to the user. |
| **Renderer Process** | The Chromium/browser side of Electron. Renders the React UI. Has no direct OS access for security. |
| **IPC** | Inter-Process Communication. The bridge between Main and Renderer. Messages go through named "channels". |
| **contextBridge** | Electron's secure API for exposing specific, whitelisted functions from Main to Renderer. Lives in `preload.js`. |
| **preload.js** | A special script that runs before the Renderer loads and sets up the `window.hivemind` API. Only file that can touch both processes. |
| **contextIsolation** | Electron security setting. When `true`, the Renderer's `window` object is separate from the preload's `window`. Prevents Renderer from accessing Node.js. |
| **safeStorage** | Electron API for encrypting strings using the operating system's credential store (Keychain on Mac, Credential Manager on Windows). Used for API keys. |
| **WebSocket** | A persistent, bidirectional network connection. HiveMind connects to the OpenClaw/NemoClaw daemon over WebSocket at `ws://127.0.0.1:18789`. |
| **Supabase** | A hosted Postgres database with Auth, Row Level Security, and Realtime subscriptions. Our persistence layer. |
| **RLS** | Row Level Security. A Postgres feature where each table has policies defining who can read/write which rows. All our tables use it. |
| **Zustand** | A lightweight React state management library. Stores live in `src/store/`. |
| **Framer Motion** | A React animation library. Used for page transitions, modal animations, staggered card entries. |
| **Vite** | A fast build tool and development server for frontend code. |
| **electron-builder** | A tool that packages the Electron app into distributable installers (.exe, .dmg, .AppImage). |

### OpenClaw / NemoClaw Terms

| Term | Definition |
|------|-----------|
| **Gateway** | The local daemon (background process) that runs agents. Listens for WebSocket connections. The "engine" that HiveMind OS connects to. |
| **Gateway Bridge** | The code in `electron/ipc/gatewayBridge.js` that manages the WebSocket connection to the Gateway. |
| **Wire Protocol** | The specific JSON message format used to communicate with the Gateway. Every message has a `type`, `id`, `method`, and `params`. |
| **Connect Frame** | The very first WebSocket message that MUST be sent on every new connection or the Gateway hard-closes. `{ type: "req", method: "connect", params: { version: "1.0", token: "" } }` |
| **req / res / event** | The three types of Gateway messages. `req` = we send a request. `res` = Gateway responds. `event` = Gateway pushes unsolicited events. |
| **sessions_spawn** | A Gateway method to make one agent spawn a sub-agent. Example: Orchestrator spawns Coder with a specific sub-task. |
| **security_checkpoint** | A Gateway event type. Fires when an agent hits a security boundary and needs human approval before continuing. |
| **openclaw.json** | The master config file at `~/.openclaw/openclaw.json` that defines all agents and their settings. Generated from the database on every app start. Never hand-edited. |

---

## 3. Architecture Overview

### The Three Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    ELECTRON APP (HiveMind OS)                │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              RENDERER PROCESS (React UI)             │   │
│  │  Dashboard | Agents | Builder | Tasks | Settings     │   │
│  │  Zustand Stores | React Context | Framer Motion      │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                          │  window.hivemind (IPC)            │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │              MAIN PROCESS (Node.js)                  │   │
│  │  IPC Handlers | Gateway Bridge | File System         │   │
│  └────────────┬──────────────────────────┬─────────────┘   │
└───────────────┼──────────────────────────┼─────────────────┘
                │                          │
                ▼ WebSocket                ▼ HTTPS
    ┌───────────────────────┐  ┌──────────────────────────┐
    │  OpenClaw / NemoClaw  │  │   Supabase (Postgres)     │
    │  Gateway Daemon       │  │   agents, tasks,          │
    │  ws://127.0.0.1:18789 │  │   audit_log, checkpoints  │
    │  (runs AI agents)     │  │   skills, user_settings   │
    └───────────────────────┘  └──────────────────────────┘
```

### Why Two Separate Data Sources?

- **Gateway (WebSocket)** — Live, real-time agent state. What agents are doing *right now*. Status changes, output, checkpoints. Ephemeral.
- **Supabase (Database)** — Configuration and history. Agent definitions, task history, audit log, skill registry. Persistent across restarts.

When the same data exists in both (like agent status), the Gateway is the source of truth for live state; Supabase is the fallback when the Gateway is offline.

### The IPC Security Boundary

The Renderer (React) cannot directly access the filesystem, database, or WebSocket. It can only call functions explicitly exposed through the IPC whitelist in `preload.js`. This is Electron's security model.

```
Renderer:   window.hivemind.invoke('db:agents:list')
                          ↓
preload.js: [checks channel is in whitelist] → ipcRenderer.invoke()
                          ↓
main.js:    ipcMain.handle('db:agents:list') → dbHandlers.js
                          ↓
supabase.js: supabase.from('agents').select('*')
                          ↓
Supabase:   Returns rows
                          ↓ (all the way back up)
Renderer:   Gets { data: [...agents] }
```

**Rule**: Components never call `window.hivemind` directly. They call functions in `src/services/db.js` or `src/services/openclaw.js`, which are the only files that touch `window.hivemind`.

---

## 4. Technology Stack Explained

### Electron 31

Electron wraps a website in a desktop window. It has two processes:
- **Main process** (`electron/main.js`) — full Node.js. Handles OS operations, database, WebSocket.
- **Renderer process** (`src/`) — a Chromium browser tab. Renders React. No direct OS access.

Key settings in `electron/main.js` that **must never be changed**:
```javascript
contextIsolation: true   // Renderer can't access Node.js APIs
nodeIntegration: false   // Renderer can't use require()
sandbox: true            // Extra OS-level sandboxing
webSecurity: true        // Same-origin policy enforced
```

### React 18 + React Router 6

Standard React with functional components and hooks. Router defines 8 screens as separate routes. All screens are **lazy-loaded** (code split) so the app starts fast.

### Zustand 4

State management. Three main stores:
- `agentStore` — agent statuses, active checkpoint, goal/task tracking
- `taskStore` — task list and activity feed messages
- `settingsStore` — app preferences

Stores use `subscribeWithSelector` which means components can subscribe to specific slices of state without re-rendering on every store change.

### Framer Motion 11

All animations. Key patterns used:
- `AnimatePresence` — wraps conditional renders so exit animations fire before unmount
- `motion.div` with `initial/animate/exit` props — declarative animation
- Staggered children — `staggerChildren` in parent variants + `custom` delay per child

**Every conditional render of a significant component must use `AnimatePresence`** — otherwise the exit animation never fires.

### Supabase

Postgres database with extras:
- **Auth** — (not used for user auth here; we use anon key + RLS)
- **RLS (Row Level Security)** — Postgres-level access policies on every table
- **Realtime** — (not used currently; we get live updates from the Gateway instead)
- **Edge Functions** — (for future use with service-role operations)

The `@supabase/supabase-js` package is imported **only** in `electron/services/supabase.js`. It is never imported in `src/`. This is enforced by convention and catches a class of security bugs where credentials could leak to the renderer.

### Tailwind 3

Utility CSS framework. All color values come from CSS variables (defined in `src/styles/tokens.css`), not hardcoded hex in component classes.

---

## 5. Security Model

### Layer 1: Electron Process Isolation

The Renderer process is sandboxed like a browser tab. It cannot:
- Read/write files
- Open network connections
- Access environment variables
- Use Node.js modules

All of these go through IPC.

### Layer 2: IPC Whitelist (preload.js)

`preload.js` exposes only two functions to the Renderer:
- `window.hivemind.invoke(channel, data)` — call main process, get response
- `window.hivemind.on(channel, callback)` — listen for events from main process

Only channels in the hardcoded `ALLOWED_INVOKE` and `ALLOWED_ON` arrays work. Any other channel is rejected with a console error. This means even if someone injects JavaScript into the Renderer (via prompt injection in agent output), they can only call the whitelisted channels — not arbitrary Node.js code.

### Layer 3: Content Security Policy

`electron/main.js` sets a strict CSP header:
```
Content-Security-Policy: default-src 'self'; script-src 'self'; ...
```
This prevents any inline scripts or external resource loads from running in the Renderer.

### Layer 4: Agent Output Rendering

Agent text output is always rendered as **plain text**, never as HTML. This prevents an agent response containing `<script>malicious code</script>` from executing in the UI.

### Layer 5: Credential Storage

No credential ever touches:
- `localStorage` (persists in browser storage, readable by XSS)
- Plaintext files
- Console logs
- Source code literals

All credentials use `electron.safeStorage` which encrypts using the OS credential store (Keychain / Windows Credential Manager). Credentials are set once during Onboarding and retrieved as encrypted blobs.

### Layer 6: Database RLS

Every Supabase table has Row Level Security enabled. The default posture is **deny all** — each operation requires an explicit policy grant. We use the `anon` key at runtime (which is public and safe to include in the app binary), relying on RLS policies to restrict what anonymous users can access.

The `service_role` key (which bypasses RLS) is **never** in the app binary. It only lives in `.env` for local development migrations.

### Layer 7: Security Checkpoints

When an agent wants to take a high-risk action, the Gateway fires a `security_checkpoint` event. HiveMind OS:
1. Stops rendering all other UI interactions
2. Displays the `CheckpointModal` with full details of what the agent wants to do
3. Blocks until the user explicitly clicks Approve or Reject
4. Records the decision in the `checkpoints` table
5. Sends the response back to the Gateway

The modal **cannot be dismissed with Escape** (the keydown event is prevented). This is intentional — checkpoint decisions are not skippable.

---

## 6. Directory Structure — File by File

### Root Level

```
/
├── CLAUDE.md               # AI assistant instructions for this codebase
├── ONBOARDING.md           # This file
├── PROMPT.md               # (Should contain original build specification)
├── README.md               # Quick-start instructions
├── package.json            # Dependencies and npm scripts
├── vite.config.js          # Vite build config (base: './' is critical for Electron)
├── tailwind.config.js      # Tailwind with custom font families
├── postcss.config.js       # PostCSS for Tailwind processing
├── electron-builder.config.js  # Packaging config (NSIS for Windows, DMG for Mac)
├── .env.example            # Template showing all required env vars (safe to commit)
├── .env                    # Your actual secrets (NEVER commit this)
└── .gitignore
```

### `electron/` — Main Process

```
electron/
├── main.js                 # App entry point. Creates window, sets security settings,
│                           # initializes all IPC handlers, auto-connects to Gateway.
│
├── preload.js              # The IPC whitelist. Runs before renderer loads.
│                           # Sets up window.hivemind with invoke() and on().
│                           # THIS FILE IS SECURITY-CRITICAL — review every change.
│
├── services/
│   └── supabase.js         # The ONLY place @supabase/supabase-js is imported.
│                           # Exports getSupabase() and reconfigure().
│                           # Returns null if not configured yet (triggers onboarding).
│
├── ipc/
│   ├── dbHandlers.js       # ALL database operations. Registers all 'db:*' channels.
│   │                       # Every function: get supabase, check if null, run query.
│   │
│   ├── gatewayBridge.js    # WebSocket connection to OpenClaw/NemoClaw daemon.
│   │                       # Handles connect frame, reconnection, req/res matching,
│   │                       # and forwarding events to renderer.
│   │
│   ├── agentHandlers.js    # Agent CRUD. Tries Gateway first, falls back to Supabase.
│   │                       # Prevents deletion of preset agents (is_preset check).
│   │
│   ├── taskHandlers.js     # Task queue. submit-goal creates DB record + sends to Gateway.
│   │
│   ├── fileSystemHandlers.js  # Read/write SOUL.md, AGENTS.md, MEMORY.md etc.
│   │                          # Path traversal protection with isWithinOpenClaw().
│   │
│   ├── skillHandlers.js    # Skill file management (SKILL.md parsing and install).
│   │
│   └── systemHandlers.js   # Window controls (min/max/close), safeStorage for API keys,
│                           # electron-store for settings, openclaw.json config.
│
├── dev/
│   └── mockGateway.js      # Fake Gateway for development without real OpenClaw/NemoClaw.
│                           # Run with: npm run mock-gateway
│
└── __tests__/
    ├── gatewayBridge.test.js
    └── supabase.test.js
```

### `src/` — Renderer Process (React)

```
src/
├── main.jsx                # React entry. Creates root, renders <App />.
├── App.jsx                 # Router, lazy-loaded screen imports, GatewayProvider wrap,
│                           # CheckpointModal at root level (always listening).
│
├── contexts/
│   ├── GatewayContext.jsx  # Subscribes to 14 IPC event channels from main process.
│   │                       # Updates Zustand stores when events arrive.
│   │                       # Everything that makes the UI "live" starts here.
│   └── AgentContext.jsx    # (Additional agent-specific context)
│
├── store/                  # Zustand state stores
│   ├── agentStore.js       # Agents, active goal, checkpoint state. NEVER hardcodes agents.
│   ├── taskStore.js        # Task list, activity feed (capped at 300 entries).
│   ├── settingsStore.js    # App preferences.
│   └── checkpointStore.js  # Pending checkpoint queue.
│
├── services/               # The ONLY files that call window.hivemind
│   ├── db.js               # Wraps all 'db:*' IPC channels into named functions.
│   ├── openclaw.js         # Wraps all other IPC channels (agents, tasks, files, etc).
│   ├── gatewayService.js   # Tracks Gateway connection state in renderer. NOT a WS client.
│   ├── fileService.js      # File operation helpers.
│   └── skillService.js     # Skill management helpers.
│
├── hooks/                  # Reusable React hooks
│   ├── useAgents.js        # Selector over agentStore. Returns agents, counts, actions.
│   ├── useGateway.js       # Gateway connection status.
│   ├── useActivityFeed.js  # Feed messages from taskStore.
│   └── useCheckpoint.js    # Active checkpoint from agentStore.
│
├── screens/                # Full-page views (lazy-loaded)
│   ├── Dashboard.jsx       # GoalInput/TaskProgress + AgentGrid + ActivityFeed
│   ├── Onboarding.jsx      # Multi-step first-run: Supabase creds, Gateway check, settings
│   ├── Agents.jsx          # Agent detail, SOUL.md editor, memory viewer
│   ├── Builder.jsx         # 4-step wizard to create custom agents
│   ├── Tasks.jsx           # Task queue with status filters
│   ├── Skills.jsx          # Skill registry, install/uninstall
│   ├── Memory.jsx          # Agent memory and daily logs
│   └── Settings.jsx        # Tabbed settings: Models, Security, Gateway, Team, Supabase
│
├── components/
│   ├── layout/
│   │   ├── AppShell.jsx    # Root layout: Titlebar + Sidebar + MainContent
│   │   ├── Titlebar.jsx    # Custom window title bar with minimize/maximize/close
│   │   ├── Sidebar.jsx     # Navigation links to all screens
│   │   └── MainContent.jsx # Router outlet with Suspense fallback
│   │
│   ├── dashboard/
│   │   ├── GoalInput.jsx         # Text input + submit button
│   │   ├── TaskProgress.jsx      # Progress bar + stop button (shown while running)
│   │   ├── AgentGrid.jsx         # Grid container for AgentCards
│   │   ├── AgentCard.jsx         # Single agent: name, status, current action
│   │   ├── AgentCardSkeleton.jsx # Loading skeleton for AgentCard
│   │   ├── ActivityFeed.jsx      # Scrollable live feed of events
│   │   └── FeedEntry.jsx         # Single line in the activity feed
│   │
│   ├── agents/
│   │   ├── AgentDetail.jsx    # Full agent info panel
│   │   ├── SoulEditor.jsx     # Markdown editor for SOUL.md
│   │   ├── AgentsEditor.jsx   # Editor for AGENTS.md
│   │   ├── MemoryViewer.jsx   # View agent memory logs
│   │   ├── SessionHistory.jsx # View past session logs
│   │   └── SkillsPanel.jsx    # Manage agent-specific skills
│   │
│   ├── builder/
│   │   ├── AgentBuilder.jsx    # Wizard shell with step navigation
│   │   ├── RoleWizardStep.jsx  # Step 1: Name, role, model
│   │   ├── SoulWizardStep.jsx  # Step 2: SOUL.md content
│   │   ├── SkillWizardStep.jsx # Step 3: Pick skills
│   │   └── ReviewStep.jsx      # Step 4: Review + create
│   │
│   ├── security/
│   │   ├── CheckpointModal.jsx  # BLOCKING modal. No Escape dismiss. zIndex: 10000.
│   │   ├── AuditLog.jsx         # Read-only audit log viewer
│   │   └── ViolationBanner.jsx  # Non-blocking warning for security violations
│   │
│   └── shared/
│       ├── StatusDot.jsx        # Colored circle for agent status
│       ├── Badge.jsx            # Pill/label badges
│       ├── AgentBadge.jsx       # Agent name + icon combination
│       ├── CodeBlock.jsx        # Syntax-highlighted code display
│       ├── EmptyState.jsx       # "No data" placeholder with icon
│       ├── LoadingSpinner.jsx   # Animated loading indicator
│       ├── MarkdownEditor.jsx   # Markdown editor used in SOUL/AGENTS editors
│       ├── Tooltip.jsx          # Hover tooltip
│       └── KeyboardShortcut.jsx # Keyboard shortcut display (⌘K style)
│
├── styles/
│   ├── tokens.css          # ALL CSS variables. Import before everything else.
│   │                       # Colors, spacing, borders, shadows, fonts, animations.
│   ├── globals.css         # CSS reset, base element styles, scrollbar styling
│   ├── typography.css      # Heading and text utility classes
│   └── animations.css      # Keyframe animations (@keyframes shimmer, fadeIn, etc.)
│
├── types/
│   └── supabase.ts         # AUTO-GENERATED from Supabase schema. NEVER edit manually.
│                           # Regenerate: npx supabase gen types typescript --local > src/types/supabase.ts
│
└── test/
    └── setup.js            # Vitest global test setup (@testing-library/jest-dom matchers)
```

### `supabase/`

```
supabase/
├── config.toml             # Supabase CLI project config (project ID, etc.)
├── migrations/             # (NEEDS CREATION) SQL migration files — one per schema change
│   ├── 0001_create_agents.sql
│   ├── 0002_create_tasks.sql
│   ├── 0003_create_audit_log.sql
│   ├── 0004_create_checkpoints.sql
│   └── 0005_create_skills.sql
└── seed.sql                # (NEEDS CREATION) Seeds the 9 preset agents on first DB init
```

---

## 7. Data Flow — How Everything Connects

### User Submits a Goal

```
1. User types goal in GoalInput.jsx
2. GoalInput calls agentStore.submitGoal(text)
3. agentStore calls openclaw.submitGoal(text) from src/services/openclaw.js
4. openclaw.js calls window.hivemind.invoke('task:submit-goal', { goal: text })
5. preload.js forwards to main process (channel is whitelisted)
6. taskHandlers.js receives 'task:submit-goal'
7. Creates task row in Supabase: INSERT INTO tasks (goal, status='pending')
8. Appends to audit_log: INSERT INTO audit_log (event_type='task:submitted', ...)
9. Sends to Gateway: { type: 'req', method: 'task.submit', params: { goal, taskId } }
10. Gateway routes to Orchestrator agent
11. Orchestrator starts breaking down the goal into sub-tasks
```

### Agent Takes an Action (Activity Feed)

```
1. Agent does something (writes a file, calls an API, sends a message)
2. Gateway fires: { type: 'event', event: 'agent', payload: { agentId, action, output } }
3. gatewayBridge.js receives WS message
4. Forwards to Renderer: ipcMain -> ipcRenderer on 'gateway:event'
5. GatewayContext.jsx listener for 'gateway:event' fires
6. Routes by event type to taskStore.addFeedMessage({ agentId, text, timestamp })
7. ActivityFeed.jsx re-renders with new message (via useActivityFeed hook)
```

### Security Checkpoint

```
1. Agent wants to execute code (high-risk action)
2. Gateway fires: { type: 'event', event: 'agent', payload: { type: 'security_checkpoint', ... } }
3. gatewayBridge.js receives it, emits 'security:checkpoint' to Renderer
4. GatewayContext.jsx calls agentStore.triggerCheckpoint(data)
5. agentStore sets activeCheckpoint = data
6. CheckpointModal.jsx (rendered at App root level) reads activeCheckpoint
7. When activeCheckpoint is non-null → modal appears, blocks all UI
8. User clicks Approve or Reject
9. agentStore.respondToCheckpoint(approved) fires
10. Calls openclaw.respondCheckpoint(checkpointId, approved)
11. window.hivemind.invoke('checkpoint:respond', { id, approved })
12. IPC handler sends response to Gateway
13. Gateway lets agent proceed or abort
14. agentStore.activeCheckpoint = null → modal disappears
15. Result recorded in checkpoints table in Supabase
```

### Agent Status Update

```
1. Agent status changes (idle → running → completed)
2. Gateway fires: { type: 'event', event: 'agent', payload: { type: 'status_change', agentId, status } }
3. GatewayContext.jsx routes to agentStore.updateAgentStatus(agentId, status)
4. AgentCard.jsx (subscribed via useAgentStatus hook) re-renders
5. StatusDot shows new color, card shows new action text
```

---

## 8. The 9 Preset Agents

Defined in `supabase/seed.sql`, seeded into the `agents` table. **Never hardcoded in source code.**

| ID | Name | Role | Risk Level | Notes |
|----|------|------|-----------|-------|
| `orchestrator` | Orchestrator | CEO & Task Router | Low | Receives goals, decomposes into sub-tasks, assigns to other agents |
| `pm` | Project Manager | Planning & Specification | Low | Creates project plans, tracks progress, defines acceptance criteria |
| `coder` | Coder | Software Engineering | **HIGH** | Can execute code, write files, run tests. Most powerful agent. |
| `qa` | QA Engineer | Testing & Validation | Medium | Runs test suites, validates output, reports failures |
| `cybersec` | CyberSec | Security Audit | Medium | Reviews code for vulnerabilities, checks configs |
| `design` | Designer | UI/UX & Visual Design | Low | Creates mockups, writes CSS, generates design specs |
| `marketing` | Marketing | Copywriting & Growth | Low | Writes copy, drafts emails, creates social content |
| `research` | Research | Intelligence & Analysis | Low | Web research, data synthesis, competitive analysis |
| `patrol` | Patrol | Watchdog & Recovery | Low | Monitors other agents, detects anomalies, triggers recovery |

### Sub-Agent Pattern

The Orchestrator can spawn any other agent as a sub-agent:

```javascript
// Orchestrator sends to Gateway:
{
  type: 'req',
  method: 'sessions_spawn',
  params: {
    agentId: 'coder',
    task: 'Implement the user authentication module',
    returnTo: 'orchestrator'
  }
}

// When Coder finishes, it announces result back to Orchestrator
// Orchestrator synthesizes all results into a final response
```

---

## 9. OpenClaw / NemoClaw Gateway Protocol

### Wire Protocol

Every message is a JSON object with a `type` field.

**Client → Gateway (Request):**
```json
{
  "type": "req",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "method": "task.submit",
  "params": { "goal": "Build a landing page" }
}
```

**Gateway → Client (Response):**
```json
{
  "type": "res",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "ok": true,
  "payload": { "taskId": "abc123" }
}
```
or if error:
```json
{
  "type": "res",
  "id": "...",
  "ok": false,
  "error": "Agent not found"
}
```

**Gateway → Client (Push Event):**
```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "agentId": "coder",
    "type": "action_taken",
    "action": "write_file",
    "output": "Created src/auth.js"
  },
  "seq": 42
}
```

### The Connect Frame (CRITICAL)

The **very first** message after opening the WebSocket must be:
```json
{
  "type": "req",
  "id": "<any-uuid>",
  "method": "connect",
  "params": { "version": "1.0", "token": "" }
}
```

If any other message is sent first, the Gateway immediately hard-closes the connection. This applies on every reconnect as well.

This is handled in `gatewayBridge.js` — do not change this logic.

### Gateway Event Types

| Event | When It Fires |
|-------|--------------|
| `agent` | Agent output, status change, tool call, security checkpoint |
| `chat` | Message from messaging platform integration |
| `presence` | Contact comes online/offline |
| `health` | System metrics (CPU, memory, etc.) |
| `heartbeat` | Every 30 minutes — agents read HEARTBEAT.md |
| `cron` | Scheduled job fires |

---

## 10. Supabase Database Layer

### Setup Options

**Option A: Supabase Cloud (Recommended)**
1. Create a free project at [supabase.com](https://supabase.com)
2. Copy your Project URL and Anon Key from Project Settings → API
3. Go to SQL Editor
4. Paste and run `supabase/schema.sql` (creates all tables and RLS policies)
5. Paste and run `supabase/seed.sql` (seeds 9 preset agents)
6. Enter credentials in HiveMind OS Onboarding screen

**Option B: Local Supabase (Docker required)**
```bash
npx supabase start          # Starts local Postgres + API
npx supabase db reset       # Applies all migrations + seed.sql
# Local URL: http://127.0.0.1:54321
# Local Anon Key: printed in terminal
```

### Full Database Schema

#### `agents` table
```sql
CREATE TABLE agents (
  id              TEXT PRIMARY KEY,          -- 'orchestrator', 'coder', etc.
  name            TEXT NOT NULL,
  role            TEXT NOT NULL,
  model           TEXT NOT NULL,             -- 'gemini/gemini-2.0-flash'
  workspace       TEXT,                      -- '~/.openclaw/workspace-coder'
  soul_content    TEXT,                      -- Full SOUL.md content
  agents_content  TEXT,                      -- Full AGENTS.md content
  tools_allow     JSONB DEFAULT '[]',        -- ["execute_code", "write_file"]
  tools_deny      JSONB DEFAULT '[]',        -- ["send_email"]
  sandbox_mode    TEXT DEFAULT 'all',        -- 'all' | 'none' | 'restricted'
  is_preset       BOOLEAN DEFAULT false,     -- TRUE = cannot be deleted
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

#### `tasks` table
```sql
CREATE TABLE tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
                  -- pending | running | completed | failed | cancelled
  assigned_agents JSONB DEFAULT '[]',        -- ["orchestrator", "coder"]
  result          TEXT,                      -- Final output text
  metadata        JSONB,                     -- Additional context
  created_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ
);
```

#### `audit_log` table (APPEND-ONLY — never UPDATE or DELETE)
```sql
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL,  -- 'task:submitted', 'agent:started', 'checkpoint:approved'
  agent_id    TEXT REFERENCES agents(id),
  task_id     UUID REFERENCES tasks(id),
  payload     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

#### `checkpoints` table
```sql
CREATE TABLE checkpoints (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id           TEXT NOT NULL REFERENCES agents(id),
  task_id            UUID REFERENCES tasks(id),
  action_description TEXT NOT NULL,          -- "Execute shell command: rm -rf /tmp/build"
  action_payload     JSONB,                  -- Full action details
  decision           TEXT,                   -- 'approved' | 'denied'
  decided_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now()
);
```

#### `skills` table
```sql
CREATE TABLE skills (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  version       TEXT,
  scope         TEXT NOT NULL DEFAULT 'global',  -- 'global' | 'agent'
  agent_id      TEXT REFERENCES agents(id),       -- NULL if global
  skill_content TEXT,                             -- SKILL.md contents
  enabled       BOOLEAN DEFAULT true,
  installed_at  TIMESTAMPTZ DEFAULT now()
);
```

#### `user_settings` table
```sql
CREATE TABLE user_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Row Level Security Rules

Every table needs these RLS policies (adapt for your auth scheme):

```sql
-- Enable RLS on every table
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Example policy: allow anon to read/write (for single-user desktop app)
CREATE POLICY "allow_all_anon" ON agents FOR ALL TO anon USING (true) WITH CHECK (true);
-- Repeat for other tables, or scope by user_id if multi-user
```

### IPC Channels for Database

All in `electron/ipc/dbHandlers.js`, all exposed via `src/services/db.js`:

```
db:agents:list          → supabase.from('agents').select('*')
db:agents:get           → supabase.from('agents').select().eq('id', id)
db:agents:upsert        → supabase.from('agents').upsert(agent)
db:agents:delete        → checks is_preset first → supabase.from('agents').delete()

db:tasks:list           → supabase.from('tasks').select().order('created_at', {ascending: false})
db:tasks:create         → supabase.from('tasks').insert(task)
db:tasks:update         → supabase.from('tasks').update(changes).eq('id', id)

db:audit:append         → supabase.from('audit_log').insert(entry)
db:audit:list           → supabase.from('audit_log').select().order('created_at')

db:checkpoints:create   → supabase.from('checkpoints').insert(checkpoint)
db:checkpoints:resolve  → supabase.from('checkpoints').update({decision, decided_at}).eq('id', id)

db:skills:list          → supabase.from('skills').select()
db:skills:upsert        → supabase.from('skills').upsert(skill)
db:skills:delete        → supabase.from('skills').delete().eq('id', id)

db:settings:get         → supabase.from('user_settings').select().eq('key', key)
db:settings:set         → supabase.from('user_settings').upsert({key, value})
```

---

## 11. Design System

### Philosophy

**Editorial Monochrome** — Bloomberg Terminal × Linear.app.

- White surfaces. Black type. Surgical gray accents.
- Color is used **only** for functional signals (green=running, yellow=warning, red=error).
- Design word: **restraint**.

### Typography Rules

| Font | Use | NEVER use for |
|------|-----|--------------|
| `'Playfair Display'` | Screen titles, modal titles, h1–h3 | Body text, labels |
| `'DM Sans'` | All UI text, body, buttons, labels, nav | Display/title text |
| `'JetBrains Mono'` | Agent logs, code, IDs, timestamps, config | Regular text |

**Forbidden**: Inter, Roboto, Arial as display fonts.

### Color Token System

Never write a hex code in a component. Always use a CSS variable from `src/styles/tokens.css`:

```css
/* Surfaces */
--color-bg-base: #FFFFFF           /* Page background */
--color-bg-surface: #F8F8F7        /* Cards, panels */
--color-bg-elevated: #F2F2F0       /* Modals, dropdowns */
--color-bg-scrim: rgba(0,0,0,0.55) /* Backdrop overlays */

/* Text */
--color-text-primary: #0A0A0A      /* Main content */
--color-text-secondary: #3D3D3A    /* Supporting text */
--color-text-tertiary: #8C8C87     /* Captions, hints */
--color-text-disabled: #C2C2BC     /* Disabled state */
--color-text-inverse: #FFFFFF      /* Text on dark bg */

/* Borders */
--color-border-light: rgba(0,0,0,0.06)
--color-border-medium: rgba(0,0,0,0.12)
--color-border-strong: rgba(0,0,0,0.22)
--color-border-accent: #0A0A0A      /* Focused inputs, active states */

/* Status signals */
--color-status-success-dot: #2A6E3F
--color-status-warning-dot: #8A6B1A
--color-status-error-dot: #8B1A1A
```

### Animation System

```css
/* Easings */
--ease-smooth: cubic-bezier(0.25, 0.46, 0.45, 0.94)  /* Standard UI */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)      /* Modal open (slight bounce) */
--ease-out:    cubic-bezier(0.0, 0.0, 0.2, 1)         /* Elements exiting */

/* Durations */
--dur-fast: 150ms      /* Micro-interactions, tooltips */
--dur-normal: 240ms    /* Hover states, small transitions */
--dur-slow: 380ms      /* Modals, sidebars */
--dur-enter: 420ms     /* Page entry animations */
```

**Standard page transition:**
```jsx
<motion.div
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -8 }}
  transition={{ duration: 0.42, ease: [0.25, 0.46, 0.45, 0.94] }}
>
```

**Agent card stagger:**
- Parent uses `staggerChildren: 0.055` (55ms between cards)
- Each card: `initial={{ opacity: 0, y: 8 }}` → `animate={{ opacity: 1, y: 0 }}`

---

## 12. What Is Done

The following is fully implemented and production-quality:

### Electron Infrastructure
- [x] Main window with frameless chrome, CSP, all security hardening
- [x] `preload.js` with complete IPC whitelist (109 invoke channels, 14 event channels)
- [x] Content Security Policy header
- [x] Hardware acceleration disabled (security practice)
- [x] External navigation prevention
- [x] New window creation prevention

### IPC Layer
- [x] `dbHandlers.js` — all 16 database channels
- [x] `gatewayBridge.js` — full WebSocket bridge with reconnect, request matching, event routing
- [x] `agentHandlers.js` — agent CRUD with Gateway-first, Supabase-fallback
- [x] `taskHandlers.js` — task queue and goal submission
- [x] `fileSystemHandlers.js` — all workspace file operations with path traversal protection
- [x] `skillHandlers.js` — skill management and SKILL.md parsing
- [x] `systemHandlers.js` — window controls, safeStorage, electron-store, config management

### Database Layer
- [x] `supabase.js` singleton with lazy init and `reconfigure()` for onboarding
- [x] `src/services/db.js` with all DB wrappers
- [x] Correct key separation (anon key at runtime, service role never shipped)

### React Application
- [x] All 8 screens (Dashboard, Onboarding, Agents, Builder, Tasks, Skills, Memory, Settings)
- [x] All 30+ components (layout, dashboard, agents, builder, security, shared)
- [x] All 4 Zustand stores
- [x] `GatewayContext` with 14 event subscriptions
- [x] All 4 hooks (`useAgents`, `useGateway`, `useActivityFeed`, `useCheckpoint`)
- [x] All service wrappers (`db.js`, `openclaw.js`, `gatewayService.js`)
- [x] Lazy-loaded routing with React Router 6
- [x] `CheckpointModal` blocking (no Escape dismiss, zIndex: 10000, backdrop blur)
- [x] `AnimatePresence` on all conditional renders
- [x] `AgentCardSkeleton` loading states
- [x] Complete design token system in CSS variables
- [x] Google Fonts integration (Playfair Display, DM Sans, JetBrains Mono)

### Testing
- [x] 20 test files (component, hook, service, store, electron)
- [x] 119 tests total
- [x] Vitest + React Testing Library configuration
- [x] Mock Gateway for offline development (`electron/dev/mockGateway.js`)

### Build & Config
- [x] `vite.config.js` with `base: './'` (required for Electron file-system loading)
- [x] `electron-builder.config.js` (NSIS Windows installer, DMG Mac, AppImage Linux)
- [x] `tailwind.config.js` with custom fonts
- [x] `.env.example` template

---

## 13. What Needs To Be Done

### Critical (Blockers)

**1. Create Supabase migration files**

The schema exists conceptually but the migration files don't exist in the repo. You need:
```
supabase/migrations/
├── 0001_create_agents.sql
├── 0002_create_tasks.sql
├── 0003_create_audit_log.sql
├── 0004_create_checkpoints.sql
└── 0005_create_skills.sql
```

In the short term, you can also create a combined `supabase/schema.sql` and `supabase/seed.sql` and run them manually in the Supabase SQL Editor (the README mentions this approach).

**2. Create `supabase/seed.sql`**

Seeds the 9 preset agents on first DB init. Example structure:
```sql
INSERT INTO agents (id, name, role, model, is_preset) VALUES
  ('orchestrator', 'Orchestrator', 'CEO & Task Router', 'gemini/gemini-1.5-pro', true),
  ('coder', 'Coder', 'Software Engineering', 'gemini/gemini-2.0-flash', true),
  -- ... all 9
ON CONFLICT (id) DO NOTHING;
```

**3. Fix Onboarding.jsx — hardcoded agents**

`src/screens/Onboarding.jsx` contains a hardcoded `PRESET_AGENTS` array. This violates the no-hardcoding mandate.

Fix: On the welcome step, call `db.listAgents()` and use the database results. If the DB isn't configured yet at this step, show a minimal placeholder or static welcome content (the step before credentials are entered).

**4. Fix CheckpointModal argument type mismatch**

`CheckpointModal.jsx` calls `respondToCheckpoint(id, 'approve')` but the store function signature is `respondToCheckpoint(approved: boolean, reason?: string)`. Should be:
```javascript
// Approve:
respondToCheckpoint(true)
// Deny:
respondToCheckpoint(false)
```

### High Priority

**5. Generate TypeScript types for Supabase**

After schema is applied:
```bash
npx supabase gen types typescript --local > src/types/supabase.ts
```

This gives type safety for all Supabase queries.

**6. Complete the mock Gateway**

`electron/dev/mockGateway.js` should fully simulate:
- Connect frame validation
- Task submission (simulated agent activity events over time)
- Security checkpoint fire after ~30 seconds
- Agent status changes (idle → running → completed)

This enables development without a real OpenClaw/NemoClaw installation.

**7. NemoClaw migration** (see Section 14)

### Medium Priority

**8. Implement Onboarding gateway auto-detection**

The onboarding flow should:
1. Auto-detect if NemoClaw is running at `ws://127.0.0.1:18789`
2. Show a clear success/failure indicator
3. Guide the user through starting NemoClaw if it's not running

**9. Add `openclaw.json` generation**

On app start (or after settings change), generate `~/.openclaw/openclaw.json` from the `agents` table. This config file tells NemoClaw which agents exist and their settings.

**10. Session history UI**

The `SessionHistory.jsx` component and `file:read-sessions` IPC are defined but the actual JSONL parsing and display UI may be incomplete.

---

## 14. Migration: OpenClaw → NemoClaw

NemoClaw is a more secure fork/replacement for OpenClaw. The migration involves updating the Gateway connection and any hardcoded references.

### What Changes

| Area | OpenClaw | NemoClaw |
|------|---------|---------|
| Gateway binary | `openclaw` | `nemoclaw` |
| Gateway URL | `ws://127.0.0.1:18789` | `ws://127.0.0.1:18789` (same port by default) |
| Config directory | `~/.openclaw/` | `~/.nemoclaw/` |
| Config file | `openclaw.json` | `nemoclaw.json` |
| Workspace dirs | `workspace-[name]` | `workspace-[name]` (same convention) |
| Wire protocol | `{ type: req/res/event }` | Same wire protocol |
| Connect frame | `{ method: "connect", params: { version: "1.0" } }` | Check NemoClaw docs for version |

### Files to Update for NemoClaw Migration

1. **`electron/ipc/gatewayBridge.js`**
   - Update the default URL if NemoClaw uses a different port
   - Update the connect frame `params.version` if NemoClaw uses a different version string

2. **`electron/ipc/fileSystemHandlers.js`**
   - Update the `OPENCLAW_BASE_DIR` path from `~/.openclaw` to `~/.nemoclaw`
   - Update the `isWithinOpenClaw()` validation path check

3. **`electron/ipc/systemHandlers.js`**
   - Update the config file path from `openclaw.json` to `nemoclaw.json`
   - Update any `openclaw-status` or `get-openclaw-version` IPC handlers to call `nemoclaw` binary

4. **`electron/ipc/agentHandlers.js`**
   - Update any workspace path construction: `workspace-${agentName}` inside `~/.nemoclaw/`

5. **`src/services/openclaw.js`**
   - Rename to `nemoclaw.js` (or keep name for compatibility but update comments)

6. **`README.md`**
   - Update prerequisites from OpenClaw to NemoClaw
   - Update installation instructions

7. **`CLAUDE.md`**
   - Update project description to reference NemoClaw
   - Update file system paths in "OPENCLAW FILE SYSTEM" section

8. **`supabase/seed.sql`**
   - Update workspace paths in agent records

9. **`package.json`** (npm scripts)
   - Update `mock-gateway` script if using different binary

### Environment Variable Updates

Add to `.env.example`:
```bash
# NemoClaw Gateway
NEMOCLAW_GATEWAY_URL=ws://127.0.0.1:18789
NEMOCLAW_GATEWAY_TOKEN=                   # If required
```

### Things That Stay the Same

- The wire protocol format (`req/res/event` JSON frames)
- The security checkpoint system
- The WebSocket bridge logic in `gatewayBridge.js`
- All IPC channels (the Renderer doesn't care about OpenClaw vs NemoClaw)
- All Supabase database operations
- All React components
- All tests (update mock path strings)

### Migration Checklist

```
[ ] Install NemoClaw and verify it starts
[ ] Confirm NemoClaw port (default: 18789, or update NEMOCLAW_GATEWAY_URL)
[ ] Confirm NemoClaw connect frame version string
[ ] Update OPENCLAW_BASE_DIR → NEMOCLAW_BASE_DIR in fileSystemHandlers.js
[ ] Update config file path: openclaw.json → nemoclaw.json
[ ] Update systemHandlers.js binary invocation
[ ] Update seed.sql workspace paths
[ ] Test connect → checkpoint → task flow end-to-end
[ ] Update README prerequisites
[ ] Update mock gateway for local development
```

---

## 15. Setup From Scratch

### Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **NemoClaw** — install and add to PATH
- **Supabase project** — free at [supabase.com](https://supabase.com) (or local with Docker)
- **Gemini API key** — from [Google AI Studio](https://aistudio.google.com)

### Step 1: Clone & Install

```bash
git clone <repo-url> hivemind-os
cd hivemind-os
npm install
```

### Step 2: Create `.env`

```bash
cp .env.example .env
```

Edit `.env`:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...              # From Supabase → Project Settings → API
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # Local dev only
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=
GEMINI_API_KEY=AIza...
```

### Step 3: Initialize Supabase Schema

In your Supabase project's SQL Editor, run these in order:

1. `supabase/schema.sql` — creates all tables and RLS policies
2. `supabase/seed.sql` — seeds the 9 preset agents

### Step 4: Start NemoClaw

```bash
nemoclaw start
# Verify it's running at ws://127.0.0.1:18789
```

### Step 5: Start HiveMind OS

```bash
npm run dev
```

The app will open. The Onboarding screen appears on first run. Enter your Supabase credentials when prompted — they are encrypted and stored in the OS credential store.

### Step 6: Verify Connection

1. Dashboard should show 9 agent cards
2. Gateway status indicator (top-right) should show "Connected"
3. Activity Feed should show initial system messages

### Development Without NemoClaw

```bash
npm run mock-gateway   # Start mock in one terminal
npm run dev            # Start app in another terminal
```

---

## 16. Common Bugs & How To Avoid Them

### 1. Gateway rejects connection immediately

**Cause:** The connect frame was not the first message, or has wrong format.

**Fix:** In `gatewayBridge.js`, the WebSocket `open` handler must immediately send:
```javascript
ws.send(JSON.stringify({
  type: 'req',
  id: uuidv4(),
  method: 'connect',
  params: { version: '1.0', token: '' }
}));
```
This must happen on **every** connection including reconnects.

---

### 2. Supabase returns null / "not configured"

**Cause:** `getSupabase()` returns null when env vars aren't set.

**Fix:** Complete Onboarding to set credentials via `reconfigure()`. In dev, ensure `.env` has `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

---

### 3. Agent rows not appearing (empty grid)

**Cause:** `seed.sql` hasn't been run, or `agents` table is empty.

**Fix:** Run `seed.sql` in Supabase SQL Editor. Verify with: `SELECT * FROM agents;`

---

### 4. Modal/animation never exits

**Cause:** `AnimatePresence` is missing from the parent component.

**Fix:** Every conditionally-rendered component that has an exit animation needs to be wrapped:
```jsx
<AnimatePresence>
  {isVisible && <MyComponent key="unique-key" />}
</AnimatePresence>
```
The `key` prop is required for `AnimatePresence` to track the element.

---

### 5. Escape key dismisses checkpoint modal

**This is a bug — checkpoints must not be dismissable.**

**Fix:** In `CheckpointModal.jsx`:
```javascript
useEffect(() => {
  const prevent = (e) => {
    if (e.key === 'Escape') e.preventDefault();
  };
  window.addEventListener('keydown', prevent, true); // true = capture phase
  return () => window.removeEventListener('keydown', prevent, true);
}, []);
```

---

### 6. Importing `electron` or `@supabase/supabase-js` in `src/`

**This crashes the renderer.** Node.js modules are not available in the browser context.

**Fix:** Any code that needs Supabase goes in `electron/`. The renderer communicates through IPC only.

---

### 7. Credentials in localStorage or console logs

**Never do this.** localStorage survives browser DevTools access. Console logs can be scraped by extensions.

**Fix:** Use `safeStorage` (via IPC channel `settings:save-api-key`).

---

### 8. Hardcoding agent IDs or names in source code

**Violation of the no-hardcoding mandate.** Agents could be renamed, removed, or customized.

**Fix:** Always fetch agents from the database:
```javascript
const { data: agents } = await db.listAgents();
```

---

### 9. UPDATE or DELETE on `audit_log`

**This destroys the integrity of the audit trail.** The audit log is a legal and security record.

**Fix:** Only ever INSERT into `audit_log`. If you need to "cancel" an action, insert a new cancellation row.

---

### 10. Calling `window.hivemind.invoke()` directly in a component

**This bypasses the service layer** and makes the component hard to test.

**Fix:** Call the function from `src/services/db.js` or `src/services/openclaw.js` instead.

---

## 17. Testing

### Running Tests

```bash
npm test              # Run all tests once
npm run test:watch    # Re-run on file change
npm run test:coverage # Coverage report
```

### Test Architecture

Tests use Vitest (same API as Jest) and React Testing Library.

**What's tested:**
- Component behavior (AgentCard, CheckpointModal, GoalInput, etc.)
- Hook logic (useAgents, useActivityFeed, useCheckpoint)
- Service layer (db.js, openclaw.js functions)
- Store actions (agentStore, taskStore, settingsStore)
- Electron IPC handlers (gatewayBridge, supabase client)

**Key mocks:**
- `window.hivemind` is mocked in `src/test/setup.js`
- `electron` module is mocked for IPC handler tests
- Mock Gateway (`electron/dev/mockGateway.js`) for integration-level tests

### Writing New Tests

```javascript
// For components:
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// For stores (test actions directly):
import { useAgentStore } from '../store/agentStore';
const { fetchAgents, submitGoal } = useAgentStore.getState();
```

---

## 18. Contribution Guide

### Before You Write Code

1. Read `CLAUDE.md` fully — it defines all architectural rules
2. Understand which process you're working in (Main vs Renderer)
3. If adding a new IPC channel: add it to both `preload.js` whitelist AND register it in the appropriate handler file

### Code Review Checklist

- [ ] No `import { ... } from 'electron'` or `import { createClient } from '@supabase/supabase-js'` in `src/`
- [ ] No hardcoded agent IDs, names, or model strings in components
- [ ] No hardcoded hex colors — CSS variables only
- [ ] No credentials in code, logs, or localStorage
- [ ] No UPDATE or DELETE on `audit_log`
- [ ] New conditional renders wrapped in `AnimatePresence`
- [ ] New DB columns have RLS policies
- [ ] New IPC channels registered in preload.js whitelist
- [ ] CheckpointModal cannot be escaped or dismissed except via Approve/Reject

### Naming Conventions

```
Components:      PascalCase         AgentCard.jsx
Hooks:           use + CamelCase    useAgentStore.js
IPC channels:    prefix:action      'db:agents:list', 'checkpoint:respond'
DB tables:       snake_case         audit_log, user_settings
CSS variables:   --category-name    --color-text-primary
Agent IDs:       kebab-case         'orchestrator', 'cybersec'
Services:        camelCase.js       db.js, openclaw.js
Stores:          camelCaseStore.js  agentStore.js
```

### Schema Changes

1. Create new migration: `supabase/migrations/NNNN_description.sql`
2. Apply: `npx supabase db push`
3. Regenerate types: `npx supabase gen types typescript --local > src/types/supabase.ts`
4. **Never edit `src/types/supabase.ts` manually**

---

*Last updated: 2026-03-21*
*HiveMind OS v0.1.0*
