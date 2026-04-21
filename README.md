# HiveMind OS

A production-grade Electron desktop application for orchestrating multiple [OpenClaw](https://openclaw.ai) AI agents in parallel. Built for real workflows — not demos.

## What it does

HiveMind OS connects to a running OpenClaw gateway and gives you a unified control panel for your entire agent team. You can dispatch tasks, monitor live activity, approve or reject security checkpoints, manage agent configurations, and inspect memory logs — all from one app. The UI is **not** a generic chat: you sign in, connect to Supabase and the gateway, then operate agents as a mission-control surface.

## Prerequisites

- **Node.js 18+**
- A **[Supabase](https://supabase.com) project** (free tier works), *or* a **local Supabase** stack via the [Supabase CLI](https://supabase.com/docs/guides/cli) (requires **Docker**)
- For live agent runs: **[OpenClaw](https://openclaw.ai)** with a **gateway** reachable at your configured WebSocket URL (default `ws://127.0.0.1:18789`). For development without a real gateway, use **`npm run mock-gateway`** (see below)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the example env file and fill in values:

```bash
cp .env.example .env
```

| Variable | Notes |
|----------|--------|
| `SUPABASE_URL` | Required — project URL |
| `SUPABASE_ANON_KEY` | Required — public anon key (used with RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional — **local dev / migrations only**; never ship in the app binary |
| `OPENCLAW_GATEWAY_URL` | Default: `ws://127.0.0.1:18789` |
| `OPENCLAW_GATEWAY_TOKEN` | Set if your gateway requires a token |
| `GEMINI_API_KEY` | Used for LLM calls; can also be stored via the app’s secure storage after first run |

### 3. Initialize the database

There is **no** `supabase/schema.sql` in this repo. Schema lives in **timestamped migrations** under [`supabase/migrations/`](supabase/migrations/) (`0001` … `0007`). Preset agents are loaded from [`supabase/seed.sql`](supabase/seed.sql).

**Option A — Supabase Dashboard (hosted project)**  
In the **SQL Editor**, run each migration file **in order** (`0001_create_agents.sql` through `0007_add_user_auth.sql`), then run `supabase/seed.sql`.

**Option B — Supabase CLI (local)**  
With Docker running:

```bash
npx supabase start
npx supabase db reset   # applies migrations from supabase/migrations/ and runs supabase/seed.sql
```

For a **remote** project, link the CLI and push migrations (`supabase link`, `supabase db push`), then run `supabase/seed.sql` in the SQL Editor if seeds are not part of your deploy pipeline.

Enable **Supabase Auth** (e.g. email) in the dashboard; the app uses authenticated routes and syncs the session to the main process for database access.

### 4. Start the app

```bash
npm run dev
```

**Optional — mock OpenClaw gateway** (separate terminal, same machine):

```bash
npm run mock-gateway
```

This listens on `ws://127.0.0.1:18789` so you can exercise the WebSocket bridge without a full OpenClaw install.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server + Electron |
| `npm run build` | Production Vite build → `dist/` |
| `npm run dist` | Build + `electron-builder` packaged app |
| `npm test` | Vitest (renderer + main-process tests) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:e2e` | Playwright E2E tests |
| `npm run test:e2e:ui` | Playwright with UI |
| `npm run mock-gateway` | Local mock gateway (protocol v3) |
| `npm run lint` | ESLint on `src/` |

## Tech stack

- **Electron 31** — frameless window, `contextIsolation`, no `nodeIntegration`
- **React 18** + React Router 6 + Zustand 4
- **Supabase** — Postgres, Auth, RLS; tables for agents, tasks, audit log, checkpoints, skills, user settings, profiles
- **Framer Motion** — page transitions and UI animation
- **Vite 5** + Tailwind 3
- **Vitest** + Testing Library (unit/integration) · **Playwright** (E2E)

## Agents

Nine preset agents are defined in `supabase/seed.sql` and are seeded into the `agents` table:

| Agent | Role |
|-------|------|
| Orchestrator | CEO & task router |
| Project Manager | Planning & specification |
| Coder | Software engineering |
| QA Engineer | Testing & validation |
| CyberSec | Security audit |
| Designer | UI/UX & visual design |
| Marketing | Copywriting & growth |
| Research | Market intelligence |
| Patrol | Watchdog & recovery |

## Security

- API keys and Supabase credentials can be stored with OS-level **`electron.safeStorage`**
- Supabase tables use **RLS**; the main process uses a JWT synced from the renderer after sign-in
- Security checkpoints use a **blocking** modal — not dismissable like a casual toast
- The gateway bridge is designed for safe handling of agent traffic; renderer content policies apply to the UI

## More detail

See [`CLAUDE.md`](CLAUDE.md) for architecture, IPC channels, gateway protocol, and conventions for contributors.
