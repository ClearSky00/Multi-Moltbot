# CLAUDE.md

## PRODUCTION MINDSET
1. Will a real user use this? Does it solve a real problem?
2. Does the full flow work? user action → IPC → main process → gateway → response → UI update
3. Is UX obvious? Loading/error/empty/success states all handled.
4. No TODO stubs, placeholder text, dead UI, or silent failures.

**UX rules:** Every async action: loading state + disabled button. Every error: visible message. Empty states explained. Flows reach terminal state. >500ms: loading indicator. >3s: progress message.

**Happy path:** open app → log in → submit goal → see progress → approve result → task done.

---

## WHAT THIS PROJECT IS
**HiveMind OS** — production Electron desktop app. Mission control for 9 OpenClaw autonomous AI agents. User types one goal; agents execute autonomously; user only intervenes at security checkpoints and final sign-off. Connects to OpenClaw Gateway (`ws://127.0.0.1:18789`) over WebSocket. Supabase is the persistent backend. Everything local-first for agent execution. **No mocking, no hardcoding, no placeholder data.**

---

## BUILD & DEV COMMANDS
```bash
npm install && npm run dev        # Install + Vite (port 5173) + Electron hot reload
npm run build                     # Production build -> dist/
npm run dist                      # electron-builder package
npm run test / test:watch / test:e2e
npx vitest run electron/__tests__/   # Main-process tests
npx vitest run src/                  # Frontend tests
npm run mock-gateway              # Mock gateway at ws://127.0.0.1:18789 (protocol v3)
npx supabase start / db push / db reset
npx supabase gen types typescript --local > src/types/supabase.ts
```
Vite config **must** have `base: './'`.

---

## TECHNOLOGY STACK
Electron 31 (frameless) · React 18 + Router 6 · Framer Motion 11 · Zustand 4 (subscribeWithSelector) · Lucide React · Tailwind 3 + CSS variables · Vite 5 · contextBridge IPC (contextIsolation:true, nodeIntegration:false) · Supabase (Postgres+Auth+RLS+Realtime, main process only) · electron.safeStorage (API keys) · electron-store (hivemind-providers, hivemind-keys) · ws package (WebSocket, main process only) · Gemini Flash/Pro via LiteLLM · Vitest + Testing Library + Playwright · Fonts: Playfair Display, DM Sans, JetBrains Mono

---

## PROJECT STRUCTURE
```
electron/
  main.js                    # Window creation, app lifecycle, startup init
  preload.js                 # contextBridge — security-critical, strict channel whitelist
  services/
    supabase.js              # Supabase client singleton — main process ONLY
    pathUtils.js             # All path utilities (getOpenClawBase, getWorkspacePath…)
    workspaceManager.js      # Agent workspace creation/validation
    openclawConfig.js        # openclaw.json generation — only writer
    orchestrator.js          # Multi-agent pipeline (plan→delegate→synthesize→approval)
    agentMerge.js            # Fetch agents merged with per-user model prefs — only merger
    providerCredentials.js   # Write ~/.openclaw/.env.hivemind — only writer
  ipc/
    gatewayBridge.js         # WebSocket <-> OpenClaw Gateway (protocol v3 + v1.0 fallback)
    agentHandlers.js         # agent CRUD + regenerateConfig() after any agent/pref change
    taskHandlers.js          # task queue, goal submission, task:approve, task:respond
    dbHandlers.js            # ALL Supabase DB operations via IPC — only Supabase caller
    providerHandlers.js      # Model provider config + encrypted API key management
    fileSystemHandlers.js    # Read/write SOUL.md, AGENTS.md, memory
    skillHandlers.js         # Skill install/list/toggle
    systemHandlers.js        # Window controls, safeStorage, settings
  dev/mockGateway.js         # Mock OpenClaw Gateway (protocol v3)
  __tests__/                 # Main-process integration tests (vitest, node env)
src/
  main.jsx / App.jsx         # React entry + router + WS context
  contexts/                  # GatewayContext (IPC event listeners), AgentContext
  store/                     # Zustand: agentStore, taskStore, checkpointStore, settingsStore
  services/
    openclaw.js              # ALL non-db IPC calls — never call window.hivemind directly
    db.js                    # All DB IPC calls — only file calling window.hivemind('db:*')
  components/
    dashboard/               # GoalInput, AgentGrid, AgentCard, ActivityFeed, TaskProgress, OrchestratorDialogue, TaskApproval
    security/                # CheckpointModal (BLOCKING), AuditLog, ViolationBanner
    shared/                  # StatusDot, Badge, CodeBlock, QuotaExhaustedBanner
  screens/                   # Dashboard, Agents, Builder, Tasks, Skills, Memory, Settings
supabase/
  migrations/                # 0001–0014 — never edit after deploy
  seed.sql                   # Seeds the 9 preset agents
  config.toml
```

---

## SUPABASE ARCHITECTURE

**Core rule:** Supabase client instantiated once in `electron/services/supabase.js`, main process only. Renderer never has direct access. All DB ops via IPC:
```
Renderer → window.hivemind.invoke('db:agents:list') → IPC → dbHandlers.js → supabase.js → Supabase
```

**Env vars** (never committed):
```bash
SUPABASE_URL / SUPABASE_ANON_KEY        # encrypted via safeStorage in production
SUPABASE_SERVICE_ROLE_KEY               # dev/migration scripts only — NEVER in app binary
```

**Schema:**
```sql
agents(id text PK, name, role, model, workspace, soul_content, agents_content,
       tools_allow jsonb, tools_deny jsonb, sandbox_mode, is_preset bool, user_id uuid)
-- presets: is_preset=true, cannot be deleted, user_id=NULL

user_agent_preferences(id uuid PK, user_id uuid, agent_id text, model text,
                       UNIQUE(user_id, agent_id))
-- per-user model overrides — never modify agents.model for this

tasks(id uuid PK, goal, status, result, user_id, created_at, completed_at)
-- status: pending|running|awaiting_input|awaiting_approval|completed|failed|cancelled|quota_exhausted

builds(id uuid PK, title, status, agent_id, task_id, output, artifact_url,
       metadata jsonb, user_id, started_at, completed_at)
-- status: pending|running|completed|failed|cancelled|awaiting_approval|paused

audit_log(id uuid PK, event_type, agent_id, task_id, payload jsonb, user_id, created_at)
-- APPEND-ONLY — never UPDATE or DELETE
```
Also: `checkpoints`, `skills`, `user_settings`, `profiles`.

**RLS:** Enabled on every table. Default deny. All policies → `authenticated` role, `user_id = auth.uid()`. Preset agents/global skills: `user_id IS NULL`, read-only.

**IPC channels (db:*):** `db:agents:list/get/upsert/delete` · `db:tasks:list/create/update/delete` · `db:audit:append/list` · `db:checkpoints:create/resolve` · `db:skills:list/upsert/delete` · `db:builds:list/get/create/update/delete` · `db:agent-prefs:list/set` · `db:settings:get/set`

**Startup sequence:**
1. Create BrowserWindow → init gateway bridge → connect to OpenClaw Gateway
2. Register all IPC handlers (db, agent, task, fileSystem, skill, system, provider)
3. `fetchMergedAgents()` → `ensureAllWorkspaces()` → `writeConfig()` → `writeProviderCredentials()`
4. Register gateway IPC handlers

**Config regeneration** (after every agent/pref CRUD):
```javascript
const agents = await fetchMergedAgents(); // agents + per-user model overrides
await writeConfig(agents);               // writes openclaw.json
await writeProviderCredentials();        // writes ~/.openclaw/.env.hivemind
```

**No-hardcoding:** Agent IDs/names/models/tools → `agents` table. Per-user overrides → `user_agent_preferences`. Presets → `seed.sql`. API endpoints → env vars.

---

## AUTHENTICATION

**Flow:** User signs in (renderer) → Supabase Auth returns JWT → renderer calls `auth:sync-session` (accessToken + userId) → main process recreates Supabase client with JWT → RLS checks `auth.uid()`. On token refresh: re-sync. On sign out: `auth:clear-main-session`.

**Key files:** `src/lib/supabase.js` (renderer auth, PKCE) · `src/hooks/useAuth.js` · `src/store/authStore.js` · `src/components/auth/guards/RequireAuth.jsx` · `electron/ipc/authHandlers.js` · `electron/services/secureTokenStorage.js`

**Auth IPC channels:** `auth:storage:get/set/remove` · `auth:get-session/save/clear` · `auth:sync-session` · `auth:clear-main-session` · `auth:get-supabase-config` · `app:init-workspaces` (must call after auth)

---

## TASK LIFECYCLE

```
pending → running → awaiting_input → (user replies) → running → ...
                 → awaiting_approval → (user approves) → completed
                                    → (user continues) → running → ...
                 → quota_exhausted → (user resumes) → running
                 → failed / cancelled
```

**Orchestrator pipeline** (`electron/services/orchestrator.js`):
1. Planning: `buildPlanningPrompt(goal)` → orchestrator session
2. Parse: `CLARIFY: <q>` → `awaiting_input` + emit `task:awaiting-input` → stop. `PLAN:...DELEGATE(agentId):...` → continue.
3. Delegation: isolated sessions per agent, respecting `DEPENDS` ordering
4. Synthesis: orchestrator synthesizes all agent results
5. Approval: `_requestApproval()` → `awaiting_approval` + emit `task:awaiting-approval` → wait for user

**Tasks never auto-complete.** `_requestApproval()` sets status, emits event, clears `awaitingInputTaskId`.
- **Mark as Done** → `task:approve` → `completed` + emit `task:completed`
- **Continue** → `task:respond` → re-runs orchestrator with combined context

**Task IPC:** `task:submit-goal` · `task:cancel` · `task:respond` · `task:approve` · `task:resume` · `task:list` · `task:get`

**Frontend state (agentStore):** `awaitingInputTaskId` · `awaitingApprovalTask { taskId, result }`
Dashboard priority: `awaitingApprovalTask` > `awaitingInputTaskId` > GoalInput > TaskProgress

---

## PROVIDER SYSTEM

Providers + keys in `electron-store` (never Supabase). `hivemind-providers` (type/name/baseUrl/enabled) · `hivemind-keys` (safeStorage encrypted). `.env.hivemind` auto-generated on every `regenerateConfig()` — sets `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OLLAMA_API_KEY`, etc.

**Security:** Keys decrypted in handler scope only. Renderer receives `{ exists: bool, masked: "sk-l...key4" }` — never plaintext.

**Provider IPC:** `provider:list` · `provider:upsert` · `provider:delete` · `provider:save-key` · `provider:delete-key` · `provider:test` · `provider:models`

---

## OPENCLAW GATEWAY — WIRE PROTOCOL

Gateway at `ws://127.0.0.1:18789`. Bridge: `electron/ipc/gatewayBridge.js`.

**Frame types:**
```
CLIENT→GATEWAY: { type:"req", id:"<uuid>", method, params }
GATEWAY→CLIENT: { type:"res", id:"<uuid>", ok, payload?, error? }
GATEWAY→CLIENT: { type:"event", event, payload, seq? }
```

**Protocol v3 handshake:** WS opens → wait up to 3s for `connect.challenge` `{nonce,ts,protocols:[3]}` → respond with connect request + 4 scopes `["operator.read","operator.write","operator.approvals","operator.admin"]` → gateway replies `hello-ok` with `policy.tickIntervalMs`. Fallback: no challenge in 3s → send v1.0 connect frame.

**Tick keepalive:** Gateway sends `tick` → bridge responds `tick.pong`. Never forwarded to renderer.

**Device pairing:** On "pairing required" rejection → `autoApprovePairedDevice()` reads `~/.openclaw/devices/paired.json`, upgrades device entry. Identity: `~/.openclaw/identity/device.json` + `device-auth.json`. On WSL2, `~` = Windows home.

**Chat streaming:** Use `payload.delta` (new chunk only). Never `payload.text` (full accumulated). Only `chat` event handler writes to `_runBuffers`.

**Event types:** `"agent"` (output/status/tool/checkpoint/violation) · `"task"` (lifecycle) · `"chat"` (streaming delta) · `"health"` · `"heartbeat"` · `"tick"` (internal only)

**Delegation:** `sessions_send(sessionKey, message, timeoutSeconds)` — never `sessions_spawn`.

---

## OPENCLAW FILE SYSTEM
```
~/.openclaw/
  openclaw.json                # Master config — generated by openclawConfig.js
  .env.hivemind                # LiteLLM env vars — generated by providerCredentials.js
  skills/                      # Global shared skills
  credentials/                 # Shared credentials
  workspace-[agentname]/       # Per-agent brain
    SOUL.md / AGENTS.md        # Written from DB on agent save
    USER.md / MEMORY.md / HEARTBEAT.md
    memory/YYYY-MM-DD.md       # Daily append-only logs
    skills/
  agents/[agentId]/
    agent/auth-profiles.json   # API keys — NEVER share across agents
    sessions/[id].jsonl        # Session history (append-only JSONL)
```
DB is source of truth. `openclaw.json` regenerated after every agent CRUD/pref change.

---

## THE 9 PRESET AGENTS
Defined in `seed.sql`. `is_preset=true` — cannot be deleted. Users override model via `user_agent_preferences`.

| ID | Role | Default Model | Risk |
|----|------|--------------|------|
| `orchestrator` | CEO & task router | gemini-1.5-pro | Low |
| `pm` | Planning | gemini-2.0-flash | Low |
| `coder` | Engineering | gemini-2.0-flash | HIGH |
| `qa` | Testing | gemini-2.0-flash | Medium |
| `cybersec` | Security audit | gemini-2.0-flash | Medium |
| `design` | UI/UX | gemini-2.0-flash | Low |
| `marketing` | Copywriting | gemini-2.0-flash | Low |
| `research` | Intelligence | gemini-2.0-flash | Low |
| `patrol` | Watchdog | gemini-2.0-flash | Low |

---

## SECURITY REQUIREMENTS

**Electron WebPreferences (LOCKED):** `contextIsolation:true` · `nodeIntegration:false` · `sandbox:true` · `webSecurity:true` · `allowRunningInsecureContent:false`

**IPC:** Renderer via `window.hivemind.invoke()` / `window.hivemind.on()` only. New channels: add to both `ALLOWED_INVOKE` and `ALLOWED_ON` in `preload.js`. Zero `'electron'` or `'@supabase/supabase-js'` imports in `src/`. Every IPC payload validated in main process.

**Credentials:**
| What | Where |
|------|-------|
| Supabase URL / Anon Key | `safeStorage` (onboarding) |
| LLM API Keys | `safeStorage` via `hivemind-keys` |
| OpenClaw Gateway Token | `safeStorage` |
| Service Role Key | Local `.env` only — NEVER in app |

**Agent security:** Plain text output only (no raw HTML). `CheckpointModal` fully blocking (not Escape-dismissable). `audit_log` immutable.

---

## DESIGN SYSTEM

**Aesthetic:** Bloomberg Terminal × Linear.app. White surfaces. Black type. Color only for status signals.

**Fonts:** `Playfair Display` (h1–h3, titles only) · `DM Sans` (all UI) · `JetBrains Mono` (logs/code/IDs/timestamps). Forbidden: Inter, Roboto, Arial as display fonts.

**Color tokens** (never hardcode hex — always CSS variables):
```css
--color-bg-base:#FFFFFF  --color-bg-surface:#F8F8F7  --color-bg-elevated:#F2F2F0
--color-text-primary:#0A0A0A  --color-text-secondary:#3D3D3A  --color-text-tertiary:#8C8C87
--color-border-light:rgba(0,0,0,0.06)  --color-border-medium:rgba(0,0,0,0.12)
--color-status-success-dot:#2A6E3F  --color-status-warning-dot:#8A6B1A  --color-status-error-dot:#8B1A1A
--color-btn-primary-bg:#0A0A0A  --color-btn-primary-text:#FFFFFF
```

**Animation:** Spring `{ type:'spring', stiffness:340, damping:28 }` for panels/modals. Smooth `{ duration:0.32, ease:[0.25,0.46,0.45,0.94] }` for exits. `AnimatePresence` on every conditional render. `staggerChildren` + `delayChildren` for sectioned panels. Page transitions: opacity 0→1 + translateY(12→0). Agent cards: staggered fade + 8px slide, 55ms delay.

---

## CODE CONVENTIONS

**Naming:** Components: PascalCase · Hooks: useCamelCase · IPC: `prefix:action` · DB tables: snake_case · CSS vars: `--color-name` · Agent IDs: kebab-case

**Layering rules:**
- Components → `src/services/db.js` or `src/services/openclaw.js` (never `window.hivemind` directly)
- `src/services/db.js` → only `window.hivemind.invoke('db:*')` caller
- `electron/ipc/dbHandlers.js` → only `supabase.js` caller
- `electron/services/pathUtils.js` → all path resolution (no duplicate `getOpenClawBase()`)
- `electron/services/agentMerge.js` → only agents+prefs merger
- `electron/services/openclawConfig.js` → only `openclaw.json` writer
- `electron/services/providerCredentials.js` → only `.env.hivemind` writer
- `@supabase/supabase-js` → `electron/` only, never `src/`

**Schema changes:** New migration `supabase/migrations/NNNN_description.sql` → `db push` → regenerate types. Never edit `src/types/supabase.ts` manually.

---

## TESTING

**Runners:** Vitest (unit/integration) · Playwright (E2E). Frontend (`src/`): jsdom + Testing Library. Main-process (`electron/__tests__/`): node env (`@vitest-environment node`).

**Main-process test pattern** (CJS modules, ESM tests):
```javascript
import { createRequire } from 'module';
const require_ = createRequire(import.meta.url);
require_.cache[dependencyPath] = { id: path, filename: path, loaded: true, exports: mockExports };
const moduleUnderTest = require_(modulePath);
```

---

## COMMON BUGS TO AVOID

1. **v3 challenge-response** — gateway sends `connect.challenge` before accepting connect frames
2. **Resend `connect` on reconnect** — gateway rejects without it
3. **Shared `agentDir`** — auth and session collisions across agents
4. **`'electron'` / `'@supabase/supabase-js'` in `src/`** — security violation + runtime crash
5. **Credentials in `localStorage`** — use `safeStorage` only
6. **Raw agent HTML** — plain text only (prompt injection XSS)
7. **Missing `AnimatePresence`** — exit animations never fire
8. **Hardcoded hex colors** — use CSS variables
9. **`CheckpointModal` escapable** — must be fully blocking
10. **Hardcoded agent arrays** — agents come from `agents` table
11. **Editing `src/types/supabase.ts`** — regenerate with CLI only
12. **UPDATE/DELETE on `audit_log`** — append-only, permanent
13. **Service role key at runtime** — anon key + RLS only
14. **Supabase client in renderer** — main process only, via IPC
15. **Duplicate path utilities** — use `pathUtils.js`, never redefine
16. **`writeConfig()` without `writeProviderCredentials()`** — both required via `regenerateConfig()`
17. **Raw agent list to `writeConfig()`** — use `fetchMergedAgents()` first
18. **No workspace on agent create** — call `ensureWorkspace()`
19. **Forwarding tick events to renderer** — internal keepalive only
20. **Not syncing auth to main process** — call `auth:sync-session` after sign-in/refresh
21. **Missing `user_id` on insert/upsert** — required for RLS (`getUserId()`)
22. **`anon` role in RLS policies** — must be `authenticated` + `auth.uid()`
23. **`app:init-workspaces` before auth** — must be called after session sync
24. **Direct profiles insert** — auto-created by trigger on signup
25. **`payload.text` for streaming** — use `payload.delta` (chunk only)
26. **`_runBuffers` in agent event handler** — only `chat` handler accumulates tokens
27. **Auto-completing tasks** — always `_requestApproval()`, never `_finishSuccess()`
28. **Stale `awaitingInputTaskId` after approval** — `task:awaiting-approval` handler must call `setAwaitingInputTask(null)`
29. **Plaintext API key to renderer** — return `{ exists, masked }` only
30. **Modifying `agents.model` for user prefs** — use `user_agent_preferences` table

---

*See PROMPT.md for full build prompt and scaffolding examples.*
