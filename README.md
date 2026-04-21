# HiveMind OS

A production-grade Electron desktop application for orchestrating a fleet of 9 autonomous AI agents. You type one goal — the agents plan, build, test, and ship it. You only intervene at security checkpoints and final sign-off.

Connects to an [OpenClaw](https://openclaw.ai) gateway over WebSocket. Persistent state lives in Supabase. Everything runs locally for agent execution.

---

## What it does

HiveMind OS is a mission-control surface — not a chat interface. You sign in, connect to your gateway, and dispatch goals to a coordinated team of AI agents:

- **Submit a goal** → the Orchestrator decomposes it and delegates to the right agents
- **Monitor live activity** → real-time feed of what every agent is doing
- **Handle security checkpoints** → blocking modal requires explicit approve/reject before high-risk actions proceed
- **Review and approve the final result** → tasks never auto-complete; you always sign off
- **Manage agents** → edit SOUL.md, AGENTS.md, memory, skills, and per-agent model overrides

---

## Prerequisites

- **Node.js 18+**
- A **[Supabase](https://supabase.com) project** (free tier), or a local Supabase stack via the [Supabase CLI](https://supabase.com/docs/guides/cli) (requires Docker)
- **[OpenClaw](https://openclaw.ai)** with a gateway at `ws://127.0.0.1:18789` — or use `npm run mock-gateway` for development without a real installation

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

| Variable | Notes |
|----------|-------|
| `SUPABASE_URL` | Required — project URL |
| `SUPABASE_ANON_KEY` | Required — public anon key (used with RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Local dev / migrations only — never ship in the binary |
| `OPENCLAW_GATEWAY_URL` | Default: `ws://127.0.0.1:18789` |
| `OPENCLAW_GATEWAY_TOKEN` | Set if your gateway requires a token |
| `GEMINI_API_KEY` | Can also be stored via the app's secure OS storage after first run |

### 3. Initialize the database

See [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) for full instructions. The short version:

**Hosted Supabase:** Run the migration SQL files from `supabase/migrations/` in order in the SQL Editor, then run `supabase/seed.sql` to seed the 9 preset agents.

**Local (Docker):**
```bash
npx supabase start
npx supabase db reset   # applies migrations + seed.sql
```

Enable **Supabase Auth** (email or magic link) in the dashboard — the app uses authenticated routes.

### 4. Start

```bash
npm run dev
```

The Onboarding screen appears on first run. Enter your Supabase credentials; they are encrypted via OS-level secure storage (Keychain / Windows Credential Manager).

**Development with mock gateway** (no OpenClaw required):

```bash
npm run dev:mock   # starts mock gateway + Vite + Electron in one command
```

Or in separate terminals:
```bash
npm run mock-gateway   # terminal 1 — mock at ws://127.0.0.1:18789
npm run dev            # terminal 2
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server + Electron |
| `npm run dev:mock` | Mock gateway + Vite + Electron together |
| `npm run build` | Production Vite build → `dist/` |
| `npm run dist` | Build + `electron-builder` packaged app |
| `npm test` | Vitest (renderer + main-process tests) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:e2e` | Playwright E2E tests |
| `npm run test:e2e:ui` | Playwright with UI |
| `npm run mock-gateway` | Local mock gateway (protocol v3) |
| `npm run lint` | ESLint on `src/` |

---

## Tech stack

- **Electron 31** — frameless window, `contextIsolation: true`, `nodeIntegration: false`
- **React 18** + React Router 6 + Zustand 4 (`subscribeWithSelector`)
- **Framer Motion 11** — page transitions, staggered cards, blocking modals
- **Radix UI** — accessible primitives (Dialog, Select, Tabs, Switch, Tooltip, ScrollArea)
- **Supabase** — Postgres + Auth + RLS; tables for agents, tasks, audit log, checkpoints, skills, user settings, profiles
- **Tailwind 3** + CSS variable design tokens
- **Vite 5** — `base: './'` required for Electron
- **electron-store** + **`electron.safeStorage`** for encrypted credential storage
- **ws** — WebSocket client in main process only
- **Vitest** + Testing Library (unit/integration) · **Playwright** (E2E)

---

## The 9 preset agents

Seeded from `supabase/seed.sql`. `is_preset = true` — cannot be deleted. Users can override the model per-agent via the Settings screen.

| Agent | Role | Risk |
|-------|------|------|
| Orchestrator | CEO & task router | Low |
| Project Manager | Planning & specification | Low |
| Coder | Software engineering | **High** |
| QA Engineer | Testing & validation | Medium |
| CyberSec | Security audit | Medium |
| Designer | UI/UX & visual design | Low |
| Marketing | Copywriting & growth | Low |
| Research | Intelligence & analysis | Low |
| Patrol | Watchdog & recovery | Low |

---

## Security model

| Layer | Mechanism |
|-------|-----------|
| Process isolation | Renderer is sandboxed; no direct OS access |
| IPC whitelist | `preload.js` exposes only named channels — no arbitrary Node.js |
| Credential storage | `electron.safeStorage` (OS keychain) — never `localStorage` or plaintext |
| Database access | Supabase anon key + RLS; service role key never ships in the binary |
| Agent output | Always rendered as plain text — no raw HTML |
| Security checkpoints | Blocking modal, not Escape-dismissable; decision recorded in `audit_log` |
| Audit log | Append-only — no UPDATE or DELETE |

---

## Project structure

```
electron/
  main.js                  # Window, security settings, startup init
  preload.js               # contextBridge IPC whitelist — security-critical
  services/                # supabase.js, pathUtils.js, orchestrator.js, agentMerge.js, …
  ipc/                     # gatewayBridge.js, agentHandlers.js, taskHandlers.js, dbHandlers.js, …
  dev/mockGateway.js       # Mock OpenClaw gateway (protocol v3)
  __tests__/               # Main-process integration tests
src/
  main.jsx / App.jsx       # React entry + router
  contexts/                # GatewayContext, AgentContext
  store/                   # Zustand: agentStore, taskStore, checkpointStore, settingsStore
  services/                # db.js, openclaw.js (the only files that call window.hivemind)
  components/              # dashboard/, agents/, builder/, security/, shared/, layout/
  screens/                 # Dashboard, Agents, Builder, Tasks, Skills, Memory, Settings, Onboarding
  styles/                  # tokens.css (all CSS variables), globals.css, typography.css
supabase/
  migrations/              # Timestamped SQL migration files
  seed.sql                 # Seeds the 9 preset agents
```

---

## Further reading

- [`ONBOARDING.md`](ONBOARDING.md) — architecture deep-dive, data flow, design system, full DB schema, common bugs
- [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) — database setup step by step
- [`CLAUDE.md`](CLAUDE.md) — IPC channels, gateway protocol, code conventions for contributors
