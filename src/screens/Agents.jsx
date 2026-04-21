import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Search,
  Play,
  Square,
  RotateCcw,
  FileText,
  Brain,
  Shield,
  ChevronRight,
  Loader2,
  MessageSquare,
  FolderOpen,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sortAgentsByPresetOrder } from "@/lib/agentDisplayOrder";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import useAgentStore from "../store/agentStore";
import useTaskStore from "../store/taskStore";
import useProviderStore from "../store/providerStore";
import {
  startAgent,
  stopAgent,
  restartAgent,
  cancelTask,
  openAgentWorkspace,
} from "../services/openclaw";
import SoulEditor from "../components/agents/SoulEditor";
import AgentsEditor from "../components/agents/AgentsEditor";
import MemoryViewer from "../components/agents/MemoryViewer";
import SessionHistory from "../components/agents/SessionHistory";
import AgentChat from "../components/agents/AgentChat";

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const pageTransition = {
  duration: 0.42,
  ease: [0.25, 0.46, 0.45, 0.94],
};

/**
 * Returns a human-readable "last active" string for an agent.
 */
function formatLastActive(agent) {
  if (agent.status === "running") return "Active now";
  if (agent.updated_at) {
    const d = new Date(agent.updated_at);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString();
  }
  return "Never";
}

/**
 * Maps agent status strings to Badge variants and display labels.
 */
function statusBadgeProps(status) {
  switch (status) {
    case "running":
      return { variant: "default", label: "Running" };
    case "error":
      return { variant: "destructive", label: "Error" };
    case "paused":
      return { variant: "secondary", label: "Paused" };
    case "idle":
    default:
      return { variant: "outline", label: "Idle" };
  }
}

/**
 * Model picker — shows a grouped Select when models are fetched,
 * or a plain text input as fallback. Always shows the current model value.
 */
function ModelPicker({ value, modelsByProvider, onChange, disabled }) {
  const [customValue, setCustomValue] = useState(value);
  const hasModels = modelsByProvider && modelsByProvider.length > 0;

  // Keep custom input in sync when agent selection changes
  useEffect(() => {
    setCustomValue(value);
  }, [value]);

  if (hasModels) {
    // Collect all model strings so we can include the current value even if not in list
    const allModels = modelsByProvider.flatMap((g) => g.models);
    const currentIsListed = value && allModels.includes(value);

    return (
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-8 text-xs font-mono w-full">
          <SelectValue placeholder="Select model…" />
        </SelectTrigger>
        <SelectContent>
          {/* Show current model at top if it's not in any fetched list */}
          {value && !currentIsListed && (
            <SelectGroup>
              <SelectLabel className="text-xs">Current</SelectLabel>
              <SelectItem value={value} className="text-xs font-mono">
                {value}
              </SelectItem>
            </SelectGroup>
          )}
          {modelsByProvider.map(({ provider, models }) => (
            <SelectGroup key={provider.id}>
              <SelectLabel className="text-xs">{provider.name}</SelectLabel>
              {models.map((m) => (
                <SelectItem key={m} value={m} className="text-xs font-mono">
                  {m}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Fallback: free-text input when no provider models are fetched yet
  return (
    <div className="space-y-1.5">
      <Input
        value={customValue}
        onChange={(e) => setCustomValue(e.target.value)}
        onBlur={() => { if (customValue !== value) onChange(customValue); }}
        onKeyDown={(e) => { if (e.key === "Enter" && customValue !== value) onChange(customValue); }}
        disabled={disabled}
        placeholder="e.g. ollama/gemma4:e4b"
        className="h-8 text-xs font-mono"
      />
      <p
        className="text-[10px]"
        style={{ fontFamily: "var(--font-body)", color: "var(--color-text-disabled)" }}
      >
        Go to Settings → Providers → Fetch Models to populate the model list.
      </p>
    </div>
  );
}

/**
 * Overview sub-tab within the agent detail view.
 * Displays key agent metadata: name, role, model, status, tool lists, sandbox mode.
 */
function OverviewContent({ agent, modelsByProvider, onModelChange }) {
  const badge = statusBadgeProps(agent.status || "idle");
  const [saving, setSaving] = useState(false);
  const [openingWorkspace, setOpeningWorkspace] = useState(false);

  async function handleModelChange(model) {
    setSaving(true);
    await onModelChange(agent.id, model);
    setSaving(false);
  }

  async function handleOpenWorkspace() {
    setOpeningWorkspace(true);
    await openAgentWorkspace(agent.id);
    setOpeningWorkspace(false);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Identity header */}
      <div className="flex items-center gap-3">
        <Badge variant={badge.variant}>{badge.label}</Badge>
        <span
          className="text-xs uppercase tracking-wider"
          style={{
            fontFamily: "var(--font-body)",
            color: "var(--color-text-tertiary)",
          }}
        >
          {agent.role}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="shadow-none">
          <CardContent className="p-4">
            <div
              className="text-lg font-medium"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-primary)",
              }}
            >
              {agent.name}
            </div>
            <div
              className="text-xs mt-0.5"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-text-tertiary)",
              }}
            >
              Name
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardContent className="p-4">
            <div
              className="text-sm font-medium"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-primary)",
              }}
            >
              {agent.sandbox_mode || "all"}
            </div>
            <div
              className="text-xs mt-0.5"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-text-tertiary)",
              }}
            >
              Sandbox
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Model picker — full width */}
      <Card className="shadow-none">
        <CardContent className="p-4">
          <div
            className="text-xs mb-2 flex items-center justify-between"
            style={{ fontFamily: "var(--font-body)", color: "var(--color-text-tertiary)" }}
          >
            <span className="uppercase tracking-wider">Model</span>
            <div className="flex items-center gap-2">
              {agent._baseModel && agent._baseModel !== agent.model && (
                <span
                  className="text-[10px]"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-disabled)" }}
                >
                  default: {agent._baseModel}
                </span>
              )}
              {saving && <Loader2 size={11} className="animate-spin" style={{ color: "var(--color-text-tertiary)" }} />}
            </div>
          </div>
          <ModelPicker
            value={agent.model || ""}
            modelsByProvider={modelsByProvider}
            onChange={handleModelChange}
            disabled={saving}
          />
        </CardContent>
      </Card>

      {/* Tool allow / deny lists */}
      <div className="flex flex-col gap-3">
        <div>
          <span
            className="text-xs uppercase tracking-wider block mb-1.5"
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--color-text-tertiary)",
            }}
          >
            Tools Allowed
          </span>
          <div className="flex flex-wrap gap-1.5">
            {Array.isArray(agent.tools_allow) &&
            agent.tools_allow.length > 0 ? (
              agent.tools_allow.map((tool) => (
                <Badge
                  key={tool}
                  variant="secondary"
                  className="font-mono text-xs"
                >
                  {tool}
                </Badge>
              ))
            ) : (
              <span
                className="text-xs"
                style={{
                  fontFamily: "var(--font-body)",
                  color: "var(--color-text-disabled)",
                }}
              >
                No explicit allow list
              </span>
            )}
          </div>
        </div>

        <div>
          <span
            className="text-xs uppercase tracking-wider block mb-1.5"
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--color-text-tertiary)",
            }}
          >
            Tools Denied
          </span>
          <div className="flex flex-wrap gap-1.5">
            {Array.isArray(agent.tools_deny) && agent.tools_deny.length > 0 ? (
              agent.tools_deny.map((tool) => (
                <Badge
                  key={tool}
                  variant="destructive"
                  className="font-mono text-xs"
                >
                  {tool}
                </Badge>
              ))
            ) : (
              <span
                className="text-xs"
                style={{
                  fontFamily: "var(--font-body)",
                  color: "var(--color-text-disabled)",
                }}
              >
                No explicit deny list
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Current action (if running) */}
      {agent.currentAction && (
        <Card
          className="shadow-none border-l-2"
          style={{ borderLeftColor: "var(--color-border-accent)" }}
        >
          <CardContent className="p-4">
            <span
              className="text-xs uppercase tracking-wider block mb-1"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-text-tertiary)",
              }}
            >
              Current Action
            </span>
            <span
              className="text-sm"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-text-secondary)",
              }}
            >
              {agent.currentAction}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Workspace — where the agent stores task outputs, memory, session logs */}
      <Card className="shadow-none">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-xs uppercase tracking-wider"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-text-tertiary)",
              }}
            >
              Workspace
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span
              className="text-xs font-mono truncate flex-1"
              style={{ color: "var(--color-text-disabled)" }}
              title={`~/.openclaw/workspace-${agent.id}`}
            >
              ~/.openclaw/workspace-{agent.id}
            </span>
            <button
              onClick={handleOpenWorkspace}
              disabled={openingWorkspace}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs shrink-0 transition-colors duration-150 disabled:opacity-40"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border-medium)",
                fontFamily: "var(--font-body)",
                color: "var(--color-text-secondary)",
              }}
              title="Open workspace folder — see task outputs, memory, session logs"
            >
              {openingWorkspace ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <FolderOpen size={11} />
              )}
              Open Folder
            </button>
          </div>
          <p
            className="text-[10px] mt-2"
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--color-text-disabled)",
            }}
          >
            Build outputs, task.json, session logs, and agent memory live here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Agent list item used in the left sidebar.
 */
function AgentListItem({ agent, isSelected, onSelect }) {
  const badge = statusBadgeProps(agent.status || "idle");

  return (
    <button
      onClick={() => onSelect(agent.id)}
      className={cn(
        "flex items-center gap-3 w-full px-4 py-3 text-left transition-colors border-l-2",
        isSelected
          ? "border-l-foreground bg-accent"
          : "border-l-transparent hover:bg-accent/50",
      )}
    >
      {/* Status dot */}
      <span
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          agent.status === "running" && "bg-foreground animate-pulse",
          agent.status === "error" && "bg-destructive",
          agent.status === "paused" && "bg-muted-foreground",
          (!agent.status || agent.status === "idle") &&
            "bg-muted-foreground/40",
        )}
      />

      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium truncate"
          style={{
            fontFamily: "var(--font-body)",
            color: "var(--color-text-primary)",
          }}
        >
          {agent.name}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span
            className="text-xs truncate"
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 300,
              color: "var(--color-text-tertiary)",
            }}
          >
            {agent.role}
          </span>
          <span
            className="text-[10px] shrink-0"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-tertiary)",
            }}
          >
            {formatLastActive(agent)}
          </span>
        </div>
        {agent.model && (
          <div
            className="text-[10px] truncate mt-0.5"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-disabled)",
            }}
          >
            {agent.model}
          </div>
        )}
      </div>

      <ChevronRight
        size={14}
        className={cn(
          "shrink-0 transition-opacity",
          isSelected ? "opacity-60" : "opacity-0",
        )}
        style={{ color: "var(--color-text-tertiary)" }}
      />
    </button>
  );
}

/**
 * Agent detail panel shown on the right side when an agent is selected.
 * Contains action buttons and tabbed views (Overview, SOUL.md, AGENTS.md, Memory, Sessions).
 */
function AgentDetailPanel({ agent }) {
  const [actionLoading, setActionLoading] = useState(null);
  const badge = statusBadgeProps(agent.status || "idle");
  const activeTaskId = useAgentStore((s) => s.activeTaskId);
  const setAgentModel = useAgentStore((s) => s.setAgentModel);
  const tasks = useTaskStore((s) => s.tasks);
  // Subscribe to providers state directly — methods are not reactive
  const providers = useProviderStore((s) => s.providers);
  const modelsByProvider = useMemo(
    () =>
      Object.values(providers)
        .filter((p) => p.enabled && p.models?.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ provider: p, models: p.models })),
    [providers],
  );

  const orchestrationTaskId = useMemo(() => {
    if (activeTaskId) return activeTaskId;
    const running = tasks.filter((t) => t.status === "running");
    const sorted = [...running].sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime(),
    );
    return sorted[0]?.id ?? null;
  }, [activeTaskId, tasks]);

  const handleStart = useCallback(async () => {
    setActionLoading("start");
    try {
      await startAgent(agent.id);
    } catch (err) {
      console.error("[Agents] startAgent failed:", err);
    } finally {
      setActionLoading(null);
    }
  }, [agent.id]);

  const handleStop = useCallback(async () => {
    setActionLoading("stop");
    try {
      if (orchestrationTaskId) {
        const res = await cancelTask({ taskId: orchestrationTaskId });
        if (res?.error) {
          console.error("[Agents] cancelTask failed:", res.error);
        }
      }
      await stopAgent(agent.id);
    } catch (err) {
      console.error("[Agents] stopAgent failed:", err);
    } finally {
      setActionLoading(null);
    }
  }, [agent.id, orchestrationTaskId]);

  const handleRestart = useCallback(async () => {
    setActionLoading("restart");
    try {
      await restartAgent(agent.id);
    } catch (err) {
      console.error("[Agents] restartAgent failed:", err);
    } finally {
      setActionLoading(null);
    }
  }, [agent.id]);

  return (
    <div className="flex flex-col h-full">
      {/* Agent header with name + action buttons */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2
            className="text-xl font-semibold mb-1"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--color-text-primary)",
            }}
          >
            {agent.name}
          </h2>
          <div className="flex items-center gap-2">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            <span
              className="text-xs"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-tertiary)",
              }}
            >
              {agent.id}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {agent.status !== "running" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleStart}
              disabled={actionLoading !== null}
            >
              <Play size={14} />
              Start
            </Button>
          )}
          {agent.status === "running" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleStop}
              disabled={actionLoading !== null}
            >
              <Square size={14} />
              Stop
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRestart}
            disabled={actionLoading !== null}
          >
            <RotateCcw size={14} />
            Restart
          </Button>
        </div>
      </div>

      <Separator className="mb-4" />

      {/* Tabbed content area */}
      <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-fit mb-4 flex-wrap">
          <TabsTrigger value="overview" className="gap-1.5">
            <Users size={14} />
            Overview
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-1.5">
            <MessageSquare size={14} />
            Chat
            {agent.status === "running" && (
              <span className="w-1.5 h-1.5 rounded-full bg-foreground ml-0.5" />
            )}
          </TabsTrigger>
          <TabsTrigger value="soul" className="gap-1.5">
            <FileText size={14} />
            SOUL.md
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-1.5">
            <FileText size={14} />
            AGENTS.md
          </TabsTrigger>
          <TabsTrigger value="memory" className="gap-1.5">
            <Brain size={14} />
            Memory
          </TabsTrigger>
          <TabsTrigger value="sessions" className="gap-1.5">
            <Shield size={14} />
            Sessions
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 min-h-0 overflow-auto">
          <AnimatePresence mode="wait">
            <TabsContent value="overview" className="mt-0">
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <OverviewContent
                  agent={agent}
                  modelsByProvider={modelsByProvider}
                  onModelChange={setAgentModel}
                />
              </motion.div>
            </TabsContent>

            <TabsContent value="chat" className="mt-0 flex-1 min-h-0 flex flex-col">
              <motion.div
                key="chat"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="flex-1 min-h-0 flex flex-col"
                style={{ minHeight: 420 }}
              >
                <AgentChat
                  agentId={agent.id}
                  agentName={agent.name}
                  status={agent.status}
                />
              </motion.div>
            </TabsContent>

            <TabsContent value="soul" className="mt-0">
              <motion.div
                key="soul"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <SoulEditor agentId={agent.id} />
              </motion.div>
            </TabsContent>

            <TabsContent value="agents" className="mt-0">
              <motion.div
                key="agents"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <AgentsEditor agentId={agent.id} />
              </motion.div>
            </TabsContent>

            <TabsContent value="memory" className="mt-0">
              <motion.div
                key="memory"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <MemoryViewer agentId={agent.id} />
              </motion.div>
            </TabsContent>

            <TabsContent value="sessions" className="mt-0">
              <motion.div
                key="sessions"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <SessionHistory agentId={agent.id} />
              </motion.div>
            </TabsContent>
          </AnimatePresence>
        </div>
      </Tabs>
    </div>
  );
}

/**
 * Global model switcher — applies one model to all agents at once.
 */
function GlobalModelSwitcher() {
  const setAllAgentsModel = useAgentStore((s) => s.setAllAgentsModel);
  const providers = useProviderStore((s) => s.providers);
  const modelsByProvider = useMemo(
    () =>
      Object.values(providers)
        .filter((p) => p.enabled && p.models?.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ provider: p, models: p.models })),
    [providers],
  );
  const [selected, setSelected] = useState("");
  const [applying, setApplying] = useState(false);

  if (!modelsByProvider || modelsByProvider.length === 0) return null;

  async function handleApply() {
    if (!selected) return;
    setApplying(true);
    await setAllAgentsModel(selected);
    setApplying(false);
  }

  return (
    <div
      className="flex items-center gap-2 mb-4 p-3 rounded-lg"
      style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-light)" }}
    >
      <span
        className="text-xs shrink-0"
        style={{ fontFamily: "var(--font-body)", color: "var(--color-text-tertiary)" }}
      >
        Apply model to all agents:
      </span>
      <Select value={selected} onValueChange={setSelected} disabled={applying}>
        <SelectTrigger className="h-7 text-xs font-mono flex-1 max-w-xs">
          <SelectValue placeholder="Choose model…" />
        </SelectTrigger>
        <SelectContent>
          {modelsByProvider.map(({ provider, models }) => (
            <SelectGroup key={provider.id}>
              <SelectLabel className="text-xs">{provider.name}</SelectLabel>
              {models.map((m) => (
                <SelectItem key={m} value={m} className="text-xs font-mono">
                  {m}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <button
        onClick={handleApply}
        disabled={!selected || applying}
        className="flex items-center gap-1.5 px-3 py-1 rounded text-xs shrink-0 transition-colors disabled:opacity-40"
        style={{
          background: "var(--color-btn-primary-bg)",
          color: "var(--color-btn-primary-text)",
          fontFamily: "var(--font-body)",
        }}
      >
        {applying && <Loader2 size={11} className="animate-spin" />}
        Apply to All
      </button>
    </div>
  );
}

/**
 * Agents screen — two-panel layout with searchable agent list (left)
 * and detail view (right). Agent selection is synced to URL search params.
 */
export default function Agents() {
  const [searchParams, setSearchParams] = useSearchParams();
  const agents = useAgentStore((s) => s.agents);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);
  const isLoading = useAgentStore((s) => s.isLoading);
  const fetchProviders = useProviderStore((s) => s.fetchProviders);
  const isProvidersLoaded = useProviderStore((s) => s.isLoaded);

  const [searchQuery, setSearchQuery] = useState("");

  const agentList = useMemo(
    () => sortAgentsByPresetOrder(Object.values(agents)),
    [agents],
  );

  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return agentList;
    const q = searchQuery.toLowerCase();
    return agentList.filter(
      (agent) =>
        agent.name?.toLowerCase().includes(q) ||
        agent.role?.toLowerCase().includes(q) ||
        agent.id?.toLowerCase().includes(q),
    );
  }, [agentList, searchQuery]);

  const urlAgentId = searchParams.get("id");
  const [selectedId, setSelectedId] = useState(urlAgentId || null);

  useEffect(() => {
    if (agentList.length === 0) {
      fetchAgents();
    }
  }, [agentList.length, fetchAgents]);

  useEffect(() => {
    if (!isProvidersLoaded) fetchProviders();
  }, [isProvidersLoaded, fetchProviders]);

  useEffect(() => {
    if (urlAgentId && agents[urlAgentId]) {
      setSelectedId(urlAgentId);
    }
  }, [urlAgentId, agents]);

  useEffect(() => {
    if (!selectedId && agentList.length > 0) {
      setSelectedId(agentList[0].id);
    }
  }, [selectedId, agentList]);

  const handleSelect = useCallback(
    (agentId) => {
      setSelectedId(agentId);
      setSearchParams({ id: agentId });
    },
    [setSearchParams],
  );

  const selectedAgent = selectedId ? agents[selectedId] : null;

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex flex-col h-full overflow-hidden"
    >
      {/* Page header */}
      <header className="shrink-0 mb-5">
        <h1
          className="text-2xl font-semibold"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--color-text-primary)",
            margin: 0,
          }}
        >
          Agents
        </h1>
        <p
          className="text-xs mt-1"
          style={{
            fontFamily: "var(--font-body)",
            color: "var(--color-text-tertiary)",
          }}
        >
          {agentList.length} agent{agentList.length !== 1 ? "s" : ""} registered
        </p>
      </header>

      <GlobalModelSwitcher />

      {/* Main two-panel layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden rounded-lg border">
        {/* Left panel: agent list with search */}
        <div
          className="flex flex-col shrink-0"
          style={{ width: 280, borderRight: "1px solid hsl(var(--border))" }}
        >
          {/* Search input */}
          <div className="p-3">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>

          <Separator />

          {/* Agent list */}
          <ScrollArea className="flex-1">
            {isLoading && agentList.length === 0 ? (
              <div
                className="p-5 text-center"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-sm)",
                  color: "var(--color-text-tertiary)",
                }}
              >
                Loading agents...
              </div>
            ) : filteredAgents.length === 0 ? (
              <div
                className="p-5 text-center"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-sm)",
                  color: "var(--color-text-tertiary)",
                }}
              >
                {searchQuery
                  ? "No agents match your search"
                  : "No agents found"}
              </div>
            ) : (
              filteredAgents.map((agent) => (
                <AgentListItem
                  key={agent.id}
                  agent={agent}
                  isSelected={selectedId === agent.id}
                  onSelect={handleSelect}
                />
              ))
            )}
          </ScrollArea>
        </div>

        {/* Right panel: agent detail */}
        <div className="flex-1 min-w-0 overflow-auto p-6">
          <AnimatePresence mode="wait">
            {selectedAgent ? (
              <motion.div
                key={selectedAgent.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="h-full"
              >
                <AgentDetailPanel agent={selectedAgent} />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center justify-center h-full gap-3"
              >
                <Users
                  size={40}
                  strokeWidth={1}
                  style={{ color: "var(--color-text-disabled)" }}
                />
                <span
                  className="text-sm"
                  style={{
                    fontFamily: "var(--font-body)",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  Select an agent to view details
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
