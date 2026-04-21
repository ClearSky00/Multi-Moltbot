import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  ChevronLeft,
  Wifi,
  WifiOff,
  Database,
  Key,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
  Rocket,
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
import { Badge } from "@/components/ui/badge";
import { detectGateway, saveApiKey, saveSettings } from "../services/openclaw";

/* ------------------------------------------------------------------ */
/*  Constants & animation config                                       */
/* ------------------------------------------------------------------ */

const TOTAL_STEPS = 4;

const isElectron = typeof window !== "undefined" && !!window.hivemind;

const slideVariants = {
  enter: (direction) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
};

const slideTransition = {
  duration: 0.32,
  ease: [0.25, 0.46, 0.45, 0.94],
};

/* ------------------------------------------------------------------ */
/*  Step Indicator                                                     */
/* ------------------------------------------------------------------ */

function StepIndicator({ current, total }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 rounded-full transition-all duration-300",
            i === current
              ? "w-6 bg-[var(--color-btn-primary-bg)]"
              : i < current
                ? "w-2 bg-[var(--color-text-tertiary)]"
                : "w-2 bg-[var(--color-bg-elevated)]",
          )}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 1: Welcome                                                    */
/* ------------------------------------------------------------------ */

function WelcomeStep() {
  const [presetAgents, setPresetAgents] = useState([]);

  useEffect(() => {
    // Attempt to load preset agents from DB. This may fail during first-run
    // onboarding if Supabase is not yet configured — that's expected.
    let cancelled = false;
    (async () => {
      try {
        const { listAgents } = await import("../services/db");
        const result = await listAgents();
        const agents = result?.data;
        if (!cancelled && Array.isArray(agents) && agents.length > 0) {
          setPresetAgents(
            agents
              .filter((a) => a.is_preset)
              .map((a) => ({ label: a.name, desc: a.role })),
          );
        }
      } catch {
        // DB not available yet — ignore silently during onboarding
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col items-center text-center py-6">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        className="w-16 h-16 rounded-full bg-[var(--color-bg-elevated)] flex items-center justify-center mb-6"
      >
        <Rocket size={28} className="text-[var(--color-text-primary)]" />
      </motion.div>

      <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--color-text-primary)] mb-3 leading-tight">
        Welcome to HiveMind OS
      </h2>

      <p className="font-[family-name:var(--font-body)] text-base font-light text-[var(--color-text-secondary)] max-w-md leading-relaxed mb-8">
        A mission control panel for orchestrating autonomous AI agents working
        together as a coordinated team. Set up your environment in a few steps.
      </p>

      {presetAgents.length > 0 && (
        <div className="grid grid-cols-3 gap-3 max-w-sm w-full">
          {presetAgents.map((agent, idx) => (
            <motion.div
              key={agent.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.15 + idx * 0.06,
                duration: 0.3,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              className="flex flex-col items-center gap-1 py-3 px-2 bg-[var(--color-bg-surface)] border border-[var(--color-border-light)] rounded-lg"
            >
              <span className="font-[family-name:var(--font-body)] text-xs font-medium text-[var(--color-text-primary)]">
                {agent.label}
              </span>
              <span className="font-[family-name:var(--font-body)] text-[10px] text-[var(--color-text-tertiary)]">
                {agent.desc}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 2: Gateway Detection                                          */
/* ------------------------------------------------------------------ */

function GatewayStep() {
  const [detecting, setDetecting] = useState(true);
  const [detected, setDetected] = useState(false);
  const [version, setVersion] = useState("");
  const [error, setError] = useState("");

  const runDetection = useCallback(async () => {
    if (!isElectron) {
      setDetecting(false);
      setDetected(false);
      setError("Not running in Electron environment.");
      return;
    }
    setDetecting(true);
    setError("");
    try {
      const result = await detectGateway();
      const data = result?.data || result;
      if (data && (data.found || data.detected || data.version)) {
        setDetected(true);
        setVersion(data.version || "");
      } else {
        setDetected(false);
        setError("OpenClaw Gateway not detected on this machine.");
      }
    } catch (err) {
      setDetected(false);
      setError(err?.message || "Failed to detect OpenClaw.");
    } finally {
      setDetecting(false);
    }
  }, []);

  useEffect(() => {
    runDetection();
  }, [runDetection]);

  return (
    <div className="flex flex-col items-center text-center py-8">
      <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--color-text-primary)] mb-2">
        Gateway Detection
      </h2>
      <p className="font-[family-name:var(--font-body)] text-sm text-[var(--color-text-tertiary)] mb-8 max-w-sm">
        HiveMind OS connects to the OpenClaw Gateway daemon running locally on
        your machine.
      </p>

      {detecting ? (
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-[var(--color-bg-elevated)] flex items-center justify-center">
            <Loader2
              size={24}
              className="animate-spin text-[var(--color-text-secondary)]"
            />
          </div>
          <span className="font-[family-name:var(--font-body)] text-sm text-[var(--color-text-secondary)]">
            Scanning for OpenClaw Gateway...
          </span>
        </div>
      ) : detected ? (
        <div className="flex flex-col items-center gap-3">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
            className="w-14 h-14 rounded-full bg-[var(--color-status-success-bg)] flex items-center justify-center"
          >
            <Wifi
              size={24}
              className="text-[var(--color-status-success-dot)]"
            />
          </motion.div>
          <span className="font-[family-name:var(--font-body)] text-base font-medium text-[var(--color-status-success-text)]">
            Gateway detected
          </span>
          {version && (
            <Badge
              variant="outline"
              className="font-[family-name:var(--font-mono)] text-xs"
            >
              Version {version}
            </Badge>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="w-14 h-14 rounded-full bg-[var(--color-status-error-bg)] flex items-center justify-center"
          >
            <WifiOff
              size={24}
              className="text-[var(--color-status-error-dot)]"
            />
          </motion.div>
          <span className="font-[family-name:var(--font-body)] text-sm text-[var(--color-status-error-text)]">
            {error}
          </span>
          <p className="font-[family-name:var(--font-body)] text-xs text-[var(--color-text-tertiary)] max-w-sm leading-relaxed">
            Install OpenClaw from{" "}
            <span className="font-[family-name:var(--font-mono)] text-[var(--color-text-secondary)]">
              openclaw.ai
            </span>{" "}
            and ensure the Gateway daemon is running at{" "}
            <span className="font-[family-name:var(--font-mono)]">
              ws://127.0.0.1:18789
            </span>
            .
          </p>
          <Button variant="outline" size="sm" onClick={runDetection}>
            Check Again
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 3: Supabase Setup                                             */
/* ------------------------------------------------------------------ */

function SupabaseStep() {
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!url.trim() || !anonKey.trim()) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await saveSettings({
        supabase_url: url.trim(),
      });
      await saveApiKey({ provider: "supabase_anon", key: anonKey.trim() });
      setSaved(true);
    } catch (err) {
      setError(err?.message || "Failed to save Supabase credentials.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center py-6">
      <div className="w-14 h-14 rounded-full bg-[var(--color-bg-elevated)] flex items-center justify-center mb-5">
        <Database size={24} className="text-[var(--color-text-primary)]" />
      </div>

      <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--color-text-primary)] mb-2 text-center">
        Supabase Setup
      </h2>
      <p className="font-[family-name:var(--font-body)] text-sm text-[var(--color-text-tertiary)] mb-6 text-center max-w-sm">
        Connect to your Supabase project for persistent storage, auth, and
        realtime data.
      </p>

      <div className="w-full max-w-md space-y-4">
        <div className="space-y-2">
          <Label className="font-[family-name:var(--font-body)]">
            Supabase URL
          </Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-project.supabase.co"
            className="font-[family-name:var(--font-mono)] text-xs"
          />
        </div>

        <div className="space-y-2">
          <Label className="font-[family-name:var(--font-body)]">
            Anon Key
          </Label>
          <div className="relative">
            <Input
              type={keyVisible ? "text" : "password"}
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="eyJ..."
              className="pr-9 font-[family-name:var(--font-mono)] text-xs"
            />
            <button
              type="button"
              onClick={() => setKeyVisible(!keyVisible)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
              aria-label={keyVisible ? "Hide key" : "Show key"}
            >
              {keyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-[10px] text-[var(--color-text-tertiary)] font-[family-name:var(--font-body)]">
            Stored with OS-level encryption via safeStorage. Never touches disk
            in plaintext.
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || !url.trim() || !anonKey.trim()}
          className="w-full"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : saved ? (
            <CheckCircle2 size={14} />
          ) : (
            <Database size={14} />
          )}
          {saved ? "Saved" : "Save Supabase Credentials"}
        </Button>

        {error && (
          <p className="text-xs text-[var(--color-status-error-dot)] flex items-center gap-1 justify-center">
            <AlertCircle size={12} />
            {error}
          </p>
        )}

        {saved && (
          <p className="text-xs text-[var(--color-status-success-text)] flex items-center gap-1 justify-center">
            <CheckCircle2 size={12} />
            Credentials saved securely.
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 4: API Keys                                                   */
/* ------------------------------------------------------------------ */

function ApiKeysStep() {
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiVisible, setGeminiVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!geminiKey.trim()) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await saveApiKey({ provider: "gemini", key: geminiKey.trim() });
      setSaved(true);
    } catch (err) {
      setError(err?.message || "Failed to save API key.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center py-6">
      <div className="w-14 h-14 rounded-full bg-[var(--color-bg-elevated)] flex items-center justify-center mb-5">
        <Key size={24} className="text-[var(--color-text-primary)]" />
      </div>

      <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--color-text-primary)] mb-2 text-center">
        API Key Setup
      </h2>
      <p className="font-[family-name:var(--font-body)] text-sm text-[var(--color-text-tertiary)] mb-6 text-center max-w-sm">
        A Gemini API key is required for the AI agents. Get one from Google AI
        Studio.
      </p>

      <div className="w-full max-w-md space-y-4">
        <div className="space-y-2">
          <Label className="font-[family-name:var(--font-body)]">
            Gemini API Key
            <span className="text-[var(--color-status-error-dot)] ml-1">*</span>
          </Label>
          <div className="relative">
            <Input
              type={geminiVisible ? "text" : "password"}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="Enter your Google AI Studio key"
              className="pr-9 font-[family-name:var(--font-mono)] text-xs"
            />
            <button
              type="button"
              onClick={() => setGeminiVisible(!geminiVisible)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
              aria-label={geminiVisible ? "Hide key" : "Show key"}
            >
              {geminiVisible ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-[10px] text-[var(--color-text-tertiary)] font-[family-name:var(--font-body)]">
            Stored with OS-level encryption. Never exposed to the renderer
            process.
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || !geminiKey.trim()}
          className="w-full"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : saved ? (
            <CheckCircle2 size={14} />
          ) : (
            <Key size={14} />
          )}
          {saved ? "Key Saved" : "Save API Key"}
        </Button>

        {error && (
          <p className="text-xs text-[var(--color-status-error-dot)] flex items-center gap-1 justify-center">
            <AlertCircle size={12} />
            {error}
          </p>
        )}

        {saved && (
          <p className="text-xs text-[var(--color-status-success-text)] flex items-center gap-1 justify-center">
            <CheckCircle2 size={12} />
            Gemini API key saved securely. You can update it later in Settings.
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step Components Array                                              */
/* ------------------------------------------------------------------ */

const STEPS = [
  { component: WelcomeStep, label: "Welcome" },
  { component: GatewayStep, label: "Gateway" },
  { component: SupabaseStep, label: "Supabase" },
  { component: ApiKeysStep, label: "API Keys" },
];

/* ------------------------------------------------------------------ */
/*  Main Onboarding Screen                                             */
/* ------------------------------------------------------------------ */

export default function Onboarding() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const handleNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS - 1) {
      setDirection(1);
      setCurrentStep((s) => s + 1);
    }
  }, [currentStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const handleFinish = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const isLastStep = currentStep === TOTAL_STEPS - 1;
  const StepComponent = STEPS[currentStep].component;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.42, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex items-center justify-center h-full p-8"
    >
      <Card className="w-full max-w-xl border-[var(--color-border-light)] bg-[var(--color-bg-base)] shadow-sm">
        <CardHeader className="pb-2">
          <div className="mb-4">
            <StepIndicator current={currentStep} total={TOTAL_STEPS} />
          </div>
          <div className="flex items-center justify-center gap-2">
            {STEPS.map((step, idx) => (
              <Badge
                key={step.label}
                variant={idx === currentStep ? "default" : "outline"}
                className={cn(
                  "text-[10px] transition-all",
                  idx < currentStep &&
                    "bg-[var(--color-status-success-bg)] text-[var(--color-status-success-text)] border-transparent",
                  idx > currentStep && "opacity-40",
                )}
              >
                {idx < currentStep ? (
                  <CheckCircle2 size={10} className="mr-1" />
                ) : null}
                {step.label}
              </Badge>
            ))}
          </div>
        </CardHeader>

        <CardContent className="min-h-[360px] relative overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={slideTransition}
              className="w-full"
            >
              <StepComponent />
            </motion.div>
          </AnimatePresence>
        </CardContent>

        <CardFooter className="flex items-center justify-between border-t border-[var(--color-border-light)] pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            disabled={currentStep === 0}
            className={cn(currentStep === 0 && "opacity-0 pointer-events-none")}
          >
            <ChevronLeft size={14} />
            Back
          </Button>

          <span className="font-[family-name:var(--font-mono)] text-[10px] text-[var(--color-text-tertiary)]">
            {currentStep + 1} of {TOTAL_STEPS}
          </span>

          {isLastStep ? (
            <Button size="sm" onClick={handleFinish}>
              Launch Dashboard
              <ChevronRight size={14} />
            </Button>
          ) : (
            <Button size="sm" onClick={handleNext}>
              Next
              <ChevronRight size={14} />
            </Button>
          )}
        </CardFooter>
      </Card>
    </motion.div>
  );
}
