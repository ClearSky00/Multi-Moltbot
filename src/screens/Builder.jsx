import { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Wand2,
  FileText,
  Wrench,
  ClipboardCheck,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import useAgentStore from "../store/agentStore";

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const pageTransition = {
  duration: 0.42,
  ease: [0.25, 0.46, 0.45, 0.94],
};

const STEPS = [
  { key: "role", label: "Role", icon: Wand2 },
  { key: "soul", label: "Soul", icon: FileText },
  { key: "skills", label: "Skills", icon: Wrench },
  { key: "review", label: "Review", icon: ClipboardCheck },
];

// Sandbox modes are protocol-level constants defined by OpenClaw — not environment-specific.
const SANDBOX_MODES = [
  { value: "all", label: "All (full sandbox)" },
  { value: "none", label: "None (unrestricted)" },
  { value: "exec", label: "Exec only" },
];

/**
 * Generates a kebab-case ID from a name string.
 */
function generateId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Step 1: Role definition
 * Name, auto-generated ID, role description, and model selection.
 */
function RoleStep({ data, onUpdate, availableModels }) {
  const generatedId = useMemo(() => generateId(data.name || ""), [data.name]);

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--color-text-primary)",
          }}
        >
          Define the Role
        </CardTitle>
        <CardDescription>
          Name your agent and describe what it does. The ID is auto-generated
          from the name.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Name field */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="agent-name">Agent Name</Label>
          <Input
            id="agent-name"
            placeholder="e.g. Analyst"
            value={data.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
        </div>

        {/* ID (read-only, generated) */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="agent-id">Agent ID</Label>
          <Input
            id="agent-id"
            value={generatedId}
            readOnly
            disabled
            className="font-mono text-xs bg-muted"
          />
          <p
            className="text-xs"
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--color-text-tertiary)",
            }}
          >
            Auto-generated from the name. Used as the unique identifier.
          </p>
        </div>

        {/* Role description */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="agent-role">Role Description</Label>
          <Input
            id="agent-role"
            placeholder="e.g. Data analysis and reporting"
            value={data.role}
            onChange={(e) => onUpdate({ role: e.target.value })}
          />
        </div>

        {/* Model selection */}
        <div className="flex flex-col gap-2">
          <Label>Model</Label>
          <Select
            value={data.model}
            onValueChange={(val) => onUpdate({ model: val })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sandbox mode */}
        <div className="flex flex-col gap-2">
          <Label>Sandbox Mode</Label>
          <Select
            value={data.sandbox_mode}
            onValueChange={(val) => onUpdate({ sandbox_mode: val })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select sandbox mode" />
            </SelectTrigger>
            <SelectContent>
              {SANDBOX_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Step 2: SOUL.md editor
 * A large textarea for defining the agent's identity/personality document.
 */
function SoulStep({ data, onUpdate }) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--color-text-primary)",
          }}
        >
          Write the Soul
        </CardTitle>
        <CardDescription>
          Define this agent's identity, personality, capabilities, and
          boundaries in Markdown. This becomes the agent's SOUL.md file.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          value={data.soul_content}
          onChange={(e) => onUpdate({ soul_content: e.target.value })}
          placeholder={`# Agent Soul\n\nYou are an expert at...\n\n## Capabilities\n- ...\n\n## Boundaries\n- Never do...`}
          className="min-h-[320px] font-mono text-sm resize-y"
        />
      </CardContent>
    </Card>
  );
}

/**
 * Step 3: Tool allow/deny list configuration.
 * User can add tool names to allow or deny lists.
 */
function SkillsStep({ data, onUpdate }) {
  const [allowInput, setAllowInput] = useState("");
  const [denyInput, setDenyInput] = useState("");

  const addAllowTool = useCallback(() => {
    const tool = allowInput.trim();
    if (!tool) return;
    const current = Array.isArray(data.tools_allow) ? data.tools_allow : [];
    if (!current.includes(tool)) {
      onUpdate({ tools_allow: [...current, tool] });
    }
    setAllowInput("");
  }, [allowInput, data.tools_allow, onUpdate]);

  const removeAllowTool = useCallback(
    (tool) => {
      const current = Array.isArray(data.tools_allow) ? data.tools_allow : [];
      onUpdate({ tools_allow: current.filter((t) => t !== tool) });
    },
    [data.tools_allow, onUpdate],
  );

  const addDenyTool = useCallback(() => {
    const tool = denyInput.trim();
    if (!tool) return;
    const current = Array.isArray(data.tools_deny) ? data.tools_deny : [];
    if (!current.includes(tool)) {
      onUpdate({ tools_deny: [...current, tool] });
    }
    setDenyInput("");
  }, [denyInput, data.tools_deny, onUpdate]);

  const removeDenyTool = useCallback(
    (tool) => {
      const current = Array.isArray(data.tools_deny) ? data.tools_deny : [];
      onUpdate({ tools_deny: current.filter((t) => t !== tool) });
    },
    [data.tools_deny, onUpdate],
  );

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--color-text-primary)",
          }}
        >
          Configure Skills & Tools
        </CardTitle>
        <CardDescription>
          Define which tools this agent is allowed or denied access to. Leave
          empty for default permissions.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Allow list */}
        <div className="flex flex-col gap-3">
          <Label>Tools Allowed</Label>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. read_file"
              value={allowInput}
              onChange={(e) => setAllowInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addAllowTool();
                }
              }}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={addAllowTool}
              disabled={!allowInput.trim()}
            >
              <Plus size={14} />
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
            {Array.isArray(data.tools_allow) &&
              data.tools_allow.map((tool) => (
                <Badge
                  key={tool}
                  variant="secondary"
                  className="gap-1 pr-1 cursor-pointer font-mono text-xs"
                  onClick={() => removeAllowTool(tool)}
                >
                  {tool}
                  <X size={12} className="opacity-60 hover:opacity-100" />
                </Badge>
              ))}
          </div>
        </div>

        {/* Deny list */}
        <div className="flex flex-col gap-3">
          <Label>Tools Denied</Label>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. execute_command"
              value={denyInput}
              onChange={(e) => setDenyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDenyTool();
                }
              }}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={addDenyTool}
              disabled={!denyInput.trim()}
            >
              <Plus size={14} />
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
            {Array.isArray(data.tools_deny) &&
              data.tools_deny.map((tool) => (
                <Badge
                  key={tool}
                  variant="destructive"
                  className="gap-1 pr-1 cursor-pointer font-mono text-xs"
                  onClick={() => removeDenyTool(tool)}
                >
                  {tool}
                  <X size={12} className="opacity-60 hover:opacity-100" />
                </Badge>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Step 4: Review all configuration before creation.
 */
function ReviewStep({ data }) {
  const generatedId = useMemo(() => generateId(data.name || ""), [data.name]);

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--color-text-primary)",
          }}
        >
          Review & Create
        </CardTitle>
        <CardDescription>
          Verify the agent configuration below before creating.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Identity section */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span
              className="text-xs uppercase tracking-wider block mb-1"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-text-tertiary)",
              }}
            >
              Name
            </span>
            <span
              className="text-sm font-medium"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-text-primary)",
              }}
            >
              {data.name || "(not set)"}
            </span>
          </div>
          <div>
            <span
              className="text-xs uppercase tracking-wider block mb-1"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-text-tertiary)",
              }}
            >
              ID
            </span>
            <span
              className="text-xs font-medium"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-primary)",
              }}
            >
              {generatedId || "(not set)"}
            </span>
          </div>
          <div>
            <span
              className="text-xs uppercase tracking-wider block mb-1"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-text-tertiary)",
              }}
            >
              Role
            </span>
            <span
              className="text-sm"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-text-secondary)",
              }}
            >
              {data.role || "(not set)"}
            </span>
          </div>
          <div>
            <span
              className="text-xs uppercase tracking-wider block mb-1"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-text-tertiary)",
              }}
            >
              Model
            </span>
            <span
              className="text-xs"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-secondary)",
              }}
            >
              {data.model || "(not set)"}
            </span>
          </div>
          <div>
            <span
              className="text-xs uppercase tracking-wider block mb-1"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-text-tertiary)",
              }}
            >
              Sandbox
            </span>
            <span
              className="text-xs"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-secondary)",
              }}
            >
              {data.sandbox_mode || "all"}
            </span>
          </div>
        </div>

        {/* Soul preview */}
        <div>
          <span
            className="text-xs uppercase tracking-wider block mb-2"
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--color-text-tertiary)",
            }}
          >
            SOUL.md Preview
          </span>
          {data.soul_content ? (
            <pre
              className="rounded-md p-3 text-xs overflow-auto max-h-40 border"
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--color-text-secondary)",
                background: "var(--color-bg-surface)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                margin: 0,
              }}
            >
              {data.soul_content}
            </pre>
          ) : (
            <span
              className="text-xs italic"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-text-disabled)",
              }}
            >
              No soul content defined
            </span>
          )}
        </div>

        {/* Tools summary */}
        <div className="flex gap-6">
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
            <div className="flex flex-wrap gap-1">
              {Array.isArray(data.tools_allow) &&
              data.tools_allow.length > 0 ? (
                data.tools_allow.map((t) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="font-mono text-xs"
                  >
                    {t}
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
                  None
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
            <div className="flex flex-wrap gap-1">
              {Array.isArray(data.tools_deny) && data.tools_deny.length > 0 ? (
                data.tools_deny.map((t) => (
                  <Badge
                    key={t}
                    variant="destructive"
                    className="font-mono text-xs"
                  >
                    {t}
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
                  None
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Builder screen — 4-step wizard for creating custom agents.
 *
 * Steps: Role -> Soul -> Skills -> Review
 * Uses addCustomAgent from the agent store to persist to DB.
 * Navigates to /agents after successful creation.
 */
export default function Builder() {
  const navigate = useNavigate();
  const addCustomAgent = useAgentStore((s) => s.addCustomAgent);
  const agents = useAgentStore((s) => s.agents);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);

  // Derive available models from existing agents in the DB
  const availableModels = useMemo(() => {
    const modelSet = new Set();
    for (const agent of Object.values(agents)) {
      if (agent.model) modelSet.add(agent.model);
    }
    if (modelSet.size === 0) {
      // Fallback: if agents haven't loaded yet, provide a sensible default
      modelSet.add("gemini/gemini-2.0-flash");
    }
    return Array.from(modelSet).map((m) => ({
      value: m,
      label: m
        .split("/")
        .pop()
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
  }, [agents]);

  useEffect(() => {
    if (Object.keys(agents).length === 0) {
      fetchAgents();
    }
  }, [agents, fetchAgents]);

  const [currentStep, setCurrentStep] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const defaultModel = availableModels[0]?.value || "gemini/gemini-2.0-flash";
  const [agentData, setAgentData] = useState({
    name: "",
    role: "",
    model: defaultModel,
    soul_content: "",
    agents_content: "",
    tools_allow: [],
    tools_deny: [],
    sandbox_mode: "all",
  });

  const updateData = useCallback((partial) => {
    setAgentData((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, []);

  const handleBack = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, []);

  /**
   * Validates that minimal required fields are filled before creation.
   */
  const canCreate = useMemo(() => {
    const id = generateId(agentData.name || "");
    return id.length > 0 && agentData.role.trim().length > 0;
  }, [agentData.name, agentData.role]);

  /**
   * Validates that the current step has enough data to proceed.
   */
  const canProceed = useMemo(() => {
    switch (currentStep) {
      case 0: {
        const id = generateId(agentData.name || "");
        return (
          id.length > 0 && agentData.role.trim().length > 0 && agentData.model
        );
      }
      case 1:
        return true; // Soul is optional
      case 2:
        return true; // Skills are optional
      default:
        return true;
    }
  }, [currentStep, agentData]);

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    setCreateError(null);
    try {
      const id = generateId(agentData.name);
      const agentDef = {
        id,
        name: agentData.name.trim(),
        role: agentData.role.trim(),
        model: agentData.model,
        soul_content: agentData.soul_content,
        agents_content: agentData.agents_content,
        tools_allow: agentData.tools_allow,
        tools_deny: agentData.tools_deny,
        sandbox_mode: agentData.sandbox_mode,
        is_preset: false,
      };
      await addCustomAgent(agentDef);
      navigate(`/agents?id=${id}`);
    } catch (err) {
      console.error("[Builder] create agent failed:", err);
      setCreateError(
        err?.message ||
          "Failed to create agent. Please check your Supabase connection.",
      );
    } finally {
      setIsCreating(false);
    }
  }, [agentData, addCustomAgent, navigate]);

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <RoleStep
            data={agentData}
            onUpdate={updateData}
            availableModels={availableModels}
          />
        );
      case 1:
        return <SoulStep data={agentData} onUpdate={updateData} />;
      case 2:
        return <SkillsStep data={agentData} onUpdate={updateData} />;
      case 3:
        return <ReviewStep data={agentData} />;
      default:
        return null;
    }
  };

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
      <header className="shrink-0 mb-6">
        <h1
          className="text-2xl font-semibold"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--color-text-primary)",
            margin: 0,
          }}
        >
          Create Agent
        </h1>
        <p
          className="text-xs mt-1"
          style={{
            fontFamily: "var(--font-body)",
            color: "var(--color-text-tertiary)",
          }}
        >
          Build a custom agent in four steps
        </p>
      </header>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6 shrink-0">
        {STEPS.map((step, i) => {
          const StepIcon = step.icon;
          const isCompleted = i < currentStep;
          const isCurrent = i === currentStep;

          return (
            <div key={step.key} className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (i <= currentStep) setCurrentStep(i);
                }}
                disabled={i > currentStep}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-xs font-medium",
                  isCurrent && "bg-primary text-primary-foreground",
                  isCompleted &&
                    "bg-secondary text-secondary-foreground cursor-pointer",
                  !isCurrent &&
                    !isCompleted &&
                    "text-muted-foreground cursor-default",
                )}
                style={{ fontFamily: "var(--font-body)" }}
              >
                <span
                  className={cn(
                    "flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-medium",
                    isCurrent && "bg-primary-foreground text-primary",
                    isCompleted && "bg-foreground text-background",
                    !isCurrent &&
                      !isCompleted &&
                      "bg-muted text-muted-foreground",
                  )}
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {isCompleted ? <Check size={10} /> : i + 1}
                </span>
                {step.label}
              </button>

              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "w-8 h-px",
                    isCompleted ? "bg-foreground" : "bg-border",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content area */}
      <div className="flex-1 min-h-0 overflow-auto" style={{ maxWidth: 720 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>

        {/* Error message */}
        {createError && (
          <Card
            className="mt-4 shadow-none border-destructive"
            style={{ background: "var(--color-status-error-bg)" }}
          >
            <CardContent className="p-4">
              <span
                className="text-sm"
                style={{
                  fontFamily: "var(--font-body)",
                  color: "var(--color-status-error-text)",
                }}
              >
                {createError}
              </span>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer navigation */}
      <div
        className="flex items-center justify-between pt-4 mt-4 shrink-0"
        style={{ borderTop: "1px solid hsl(var(--border))" }}
      >
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 0}
          className="gap-1.5"
        >
          <ArrowLeft size={14} />
          Back
        </Button>

        <div className="flex items-center gap-2">
          {currentStep < STEPS.length - 1 && (
            <Button
              onClick={handleNext}
              disabled={!canProceed}
              className="gap-1.5"
            >
              Next
              <ArrowRight size={14} />
            </Button>
          )}

          {currentStep === STEPS.length - 1 && (
            <Button
              onClick={handleCreate}
              disabled={!canCreate || isCreating}
              className="gap-1.5"
            >
              {isCreating ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check size={14} />
                  Create Agent
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
