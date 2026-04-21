import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  EyeOff,
  Save,
  Server,
  Shield,
  Settings as SettingsIcon,
  Wifi,
  CheckCircle2,
  AlertCircle,
  Loader2,
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
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  getSettings,
  saveSettings,
  saveApiKey,
  getApiKey,
  deleteApiKey,
  connectGateway,
} from "../services/openclaw";
import {
  applyFontScaleFromSettings,
  getFontScaleSelectValue,
} from "../lib/fontScale";
import { ProviderCard } from "../components/settings/ProviderCard";
import { useProviderStore } from "../store/providerStore";

/* ------------------------------------------------------------------ */
/*  Animation                                                          */
/* ------------------------------------------------------------------ */

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

const pageTransition = {
  duration: 0.42,
  ease: [0.25, 0.46, 0.45, 0.94],
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function useSavedFlash() {
  const [saved, setSaved] = useState(false);
  const flash = useCallback(() => {
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, []);
  return [saved, flash];
}

const isElectron = typeof window !== "undefined" && !!window.hivemind;

/** Default WebSocket URL — loopback IPv4 (matches electron main resolveGatewayUrl fallback). */
const DEFAULT_GATEWAY_WS_URL = "ws://127.0.0.1:18789";

/* ------------------------------------------------------------------ */
/*  API Key Field                                                      */
/* ------------------------------------------------------------------ */

function ApiKeyField({ label, provider, description }) {
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [error, setError] = useState("");
  const [saved, flashSaved] = useSavedFlash();

  useEffect(() => {
    if (!isElectron) return;
    getApiKey({ provider })
      .then((result) => {
        if (result?.data?.exists) setHasExisting(true);
      })
      .catch(() => {});
  }, [provider]);

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    setError("");
    try {
      await saveApiKey({ provider, key: value.trim() });
      setHasExisting(true);
      setValue("");
      setVisible(false);
      flashSaved();
    } catch (err) {
      setError(err?.message || "Failed to save key");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="font-[family-name:var(--font-body)]">{label}</Label>
        {hasExisting && (
          <Badge
            variant="outline"
            className="text-[var(--color-status-success-dot)] border-[var(--color-status-success-dot)]/30 text-[10px]"
          >
            Configured
          </Badge>
        )}
      </div>
      {description && (
        <p className="text-xs text-[var(--color-text-tertiary)] font-[family-name:var(--font-body)]">
          {description}
        </p>
      )}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type={visible ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              hasExisting ? "(key saved securely)" : `Enter ${provider} key`
            }
            className="pr-9 font-[family-name:var(--font-mono)] text-xs"
          />
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
            aria-label={visible ? "Hide key" : "Show key"}
          >
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || !value.trim()}
          size="sm"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : saved ? (
            <CheckCircle2 size={14} />
          ) : (
            <Save size={14} />
          )}
          {saved ? "Saved" : "Save"}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-[var(--color-status-error-dot)] flex items-center gap-1">
          <AlertCircle size={12} />
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  General Tab                                                        */
/* ------------------------------------------------------------------ */

function GeneralTab({ settings, onUpdate }) {
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [autoStart, setAutoStart] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, flashSaved] = useSavedFlash();
  const [error, setError] = useState("");

  useEffect(() => {
    setGatewayUrl(
      settings.gateway_url || settings.gatewayUrl || DEFAULT_GATEWAY_WS_URL,
    );
    setAutoStart(
      settings.gateway_auto_start ?? settings.autoStartGateway ?? true,
    );
  }, [settings]);

  const handleSaveUrl = async () => {
    setSaving(true);
    setError("");
    try {
      const trimmed = gatewayUrl.trim();
      await onUpdate({ gateway_url: trimmed, gatewayUrl: trimmed });
      await connectGateway(trimmed);
      flashSaved();
    } catch (err) {
      setError(err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleAutoStartChange = async (checked) => {
    setAutoStart(checked);
    try {
      await onUpdate({
        gateway_auto_start: checked,
        autoStartGateway: checked,
      });
    } catch {
      setAutoStart(!checked);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-[var(--color-border-light)] bg-[var(--color-bg-base)] shadow-none">
        <CardHeader>
          <CardTitle className="font-[family-name:var(--font-display)] text-lg">
            Gateway Connection
          </CardTitle>
          <CardDescription className="font-[family-name:var(--font-body)]">
            Configure the WebSocket connection to the OpenClaw Gateway daemon.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="font-[family-name:var(--font-body)]">
              Gateway URL
            </Label>
            <div className="flex items-center gap-2">
              <Input
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                placeholder={DEFAULT_GATEWAY_WS_URL}
                className="font-[family-name:var(--font-mono)] text-xs flex-1"
              />
              <Button onClick={handleSaveUrl} disabled={saving} size="sm">
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : saved ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <Save size={14} />
                )}
                {saved ? "Saved" : "Save"}
              </Button>
            </div>
            {error && (
              <p className="text-xs text-[var(--color-status-error-dot)] flex items-center gap-1">
                <AlertCircle size={12} />
                {error}
              </p>
            )}
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="font-[family-name:var(--font-body)]">
                Auto-start Gateway
              </Label>
              <p className="text-xs text-[var(--color-text-tertiary)] font-[family-name:var(--font-body)]">
                Automatically connect to the Gateway when the app launches.
              </p>
            </div>
            <Switch
              checked={autoStart}
              onCheckedChange={handleAutoStartChange}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Add Provider Form                                                  */
/* ------------------------------------------------------------------ */

const PROVIDER_TYPES = [
  { value: "gemini", label: "Gemini (Google AI Studio)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "ollama", label: "Ollama (self-hosted)" },
  { value: "openai-compatible", label: "OpenAI-Compatible (vLLM, LM Studio…)" },
];

function AddProviderForm({ onAdd, onCancel }) {
  const [type, setType] = useState("gemini");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const needsUrl = type === "ollama" || type === "openai-compatible";

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onAdd({ type, name: name.trim(), baseUrl: baseUrl.trim(), enabled: true, isDefault: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <Card className="border-[var(--color-border-medium)] bg-[var(--color-bg-surface)] shadow-none">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold font-[family-name:var(--font-body)] text-[var(--color-text-primary)]">
              Add Provider
            </p>
            <button
              onClick={onCancel}
              className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-[family-name:var(--font-body)]">Type</Label>
            <Select value={type} onValueChange={(v) => { setType(v); setName(PROVIDER_TYPES.find(p => p.value === v)?.label.split(" ")[0] || ""); }}>
              <SelectTrigger className="font-[family-name:var(--font-body)] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_TYPES.map((pt) => (
                  <SelectItem key={pt.value} value={pt.value} className="font-[family-name:var(--font-body)]">
                    {pt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-[family-name:var(--font-body)]">Display Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Ollama, Work OpenAI"
              className="font-[family-name:var(--font-body)] text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          {needsUrl && (
            <div className="space-y-1.5">
              <Label className="text-xs font-[family-name:var(--font-body)]">Base URL</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="font-[family-name:var(--font-mono)] text-xs"
              />
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSubmit} disabled={saving || !name.trim()}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Add Provider
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Providers Tab                                                      */
/* ------------------------------------------------------------------ */

function ProvidersTab() {
  const { providers, defaultId, isLoaded, fetchProviders, upsertProvider, deleteProvider } =
    useProviderStore();
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const handleAdd = async (providerDef) => {
    await upsertProvider(providerDef);
    setShowAddForm(false);
  };

  const handleDelete = async (id) => {
    await deleteProvider(id);
  };

  const providerList = Object.values(providers).sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
  );

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[var(--color-text-tertiary)] font-[family-name:var(--font-body)]">
            Keys are encrypted with OS-level secure storage and never leave the main process.
          </p>
        </div>
        {!showAddForm && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddForm(true)}
            className="font-[family-name:var(--font-body)] text-xs flex-shrink-0"
          >
            <Plus size={13} />
            Add Provider
          </Button>
        )}
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showAddForm && (
          <AddProviderForm
            onAdd={handleAdd}
            onCancel={() => setShowAddForm(false)}
          />
        )}
      </AnimatePresence>

      {/* Provider cards */}
      {!isLoaded ? (
        <div className="flex items-center gap-2 text-[var(--color-text-tertiary)] py-4">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-sm font-[family-name:var(--font-body)]">Loading providers…</span>
        </div>
      ) : providerList.length === 0 ? (
        <Card className="border-[var(--color-border-light)] bg-[var(--color-bg-base)] shadow-none">
          <CardContent className="py-8 text-center">
            <Server size={28} className="mx-auto mb-2 text-[var(--color-text-disabled)]" />
            <p className="text-sm font-[family-name:var(--font-body)] text-[var(--color-text-tertiary)]">
              No providers configured.
            </p>
            <p className="text-xs font-[family-name:var(--font-body)] text-[var(--color-text-disabled)] mt-1">
              Add a provider above to connect to Gemini, OpenAI, Anthropic, or a self-hosted model.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {providerList.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              isDefault={p.id === defaultId}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <Separator className="bg-[var(--color-border-light)]" />

      {/* Gateway Token — kept separate, not a model provider */}
      <div className="space-y-2">
        <p className="text-xs font-semibold font-[family-name:var(--font-body)] text-[var(--color-text-secondary)] uppercase tracking-wide">
          Gateway
        </p>
        <ApiKeyField
          label="Gateway Token"
          provider="gateway_token"
          description="Sent on WebSocket connect if OPENCLAW_GATEWAY_TOKEN is not set in .env. Leave empty for the mock gateway."
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Security Tab                                                       */
/* ------------------------------------------------------------------ */

function SecurityTab({ settings, onUpdate }) {
  const [threshold, setThreshold] = useState("medium");
  const [sandboxMode, setSandboxMode] = useState("all");
  const [promptProtection, setPromptProtection] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setThreshold(settings.approval_threshold || "medium");
    setSandboxMode(settings.sandbox_mode || "all");
    setPromptProtection(settings.prompt_injection_protection ?? true);
  }, [settings]);

  const handleThresholdChange = async (val) => {
    setThreshold(val);
    setError("");
    try {
      await onUpdate({ approval_threshold: val });
    } catch (err) {
      setError(err?.message || "Failed to save");
    }
  };

  const handleSandboxChange = async (val) => {
    setSandboxMode(val);
    setError("");
    try {
      await onUpdate({ sandbox_mode: val });
    } catch (err) {
      setError(err?.message || "Failed to save");
    }
  };

  const handlePromptProtectionChange = async (checked) => {
    setPromptProtection(checked);
    setError("");
    try {
      await onUpdate({ prompt_injection_protection: checked });
    } catch (err) {
      setPromptProtection(!checked);
      setError(err?.message || "Failed to save");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-[var(--color-border-light)] bg-[var(--color-bg-base)] shadow-none">
        <CardHeader>
          <CardTitle className="font-[family-name:var(--font-display)] text-lg">
            Agent Security
          </CardTitle>
          <CardDescription className="font-[family-name:var(--font-body)]">
            Configure checkpoint approval thresholds, sandbox enforcement, and
            injection protection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="font-[family-name:var(--font-body)]">
              Approval Threshold
            </Label>
            <p className="text-xs text-[var(--color-text-tertiary)] font-[family-name:var(--font-body)]">
              Require human approval for actions above this risk level.
            </p>
            <Select value={threshold} onValueChange={handleThresholdChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select threshold" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low -- approve most actions</SelectItem>
                <SelectItem value="medium">Medium -- balanced</SelectItem>
                <SelectItem value="high">High -- approve nearly all</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="font-[family-name:var(--font-body)]">
              Sandbox Mode
            </Label>
            <p className="text-xs text-[var(--color-text-tertiary)] font-[family-name:var(--font-body)]">
              Global sandbox enforcement. Overrides per-agent settings when
              enabled.
            </p>
            <Select value={sandboxMode} onValueChange={handleSandboxChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All -- full sandbox</SelectItem>
                <SelectItem value="write">
                  Write -- sandbox writes only
                </SelectItem>
                <SelectItem value="none">None -- no sandbox</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="font-[family-name:var(--font-body)]">
                Prompt Injection Protection
              </Label>
              <p className="text-xs text-[var(--color-text-tertiary)] font-[family-name:var(--font-body)]">
                Sanitize agent output to prevent prompt injection and XSS
                attacks.
              </p>
            </div>
            <Switch
              checked={promptProtection}
              onCheckedChange={handlePromptProtectionChange}
            />
          </div>

          {error && (
            <p className="text-xs text-[var(--color-status-error-dot)] flex items-center gap-1">
              <AlertCircle size={12} />
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Appearance Tab                                                     */
/* ------------------------------------------------------------------ */

function AppearanceTab({ settings, onUpdate }) {
  const [fontScale, setFontScale] = useState("100");
  const [error, setError] = useState("");

  useEffect(() => {
    setFontScale(getFontScaleSelectValue(settings));
  }, [settings]);

  const handleFontScaleChange = async (val) => {
    setFontScale(val);
    setError("");
    try {
      await onUpdate({ font_scale: val });
    } catch (err) {
      setError(err?.message || "Failed to save");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-[var(--color-border-light)] bg-[var(--color-bg-base)] shadow-none">
        <CardHeader>
          <CardTitle className="font-[family-name:var(--font-display)] text-lg">
            Appearance
          </CardTitle>
          <CardDescription className="font-[family-name:var(--font-body)]">
            Customize the visual presentation of HiveMind OS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="font-[family-name:var(--font-body)]">
              Font Scale
            </Label>
            <p className="text-xs text-[var(--color-text-tertiary)] font-[family-name:var(--font-body)]">
              Adjust the base font size for the entire interface.
            </p>
            <Select value={fontScale} onValueChange={handleFontScaleChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select scale" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="85">Small (85%)</SelectItem>
                <SelectItem value="100">Default (100%)</SelectItem>
                <SelectItem value="115">Large (115%)</SelectItem>
                <SelectItem value="130">Extra Large (130%)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p className="text-xs text-[var(--color-status-error-dot)] flex items-center gap-1">
              <AlertCircle size={12} />
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Settings Screen                                               */
/* ------------------------------------------------------------------ */

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!isElectron) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getSettings()
      .then((result) => {
        setSettings(result?.data || result || {});
      })
      .catch((err) => {
        setLoadError(err?.message || "Failed to load settings");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleUpdate = useCallback(
    async (updates) => {
      const merged = { ...settings, ...updates };
      setSettings(merged);
      await saveSettings(merged);
      if (Object.prototype.hasOwnProperty.call(updates, "font_scale")) {
        applyFontScaleFromSettings(merged);
      }
    },
    [settings],
  );

  if (!isElectron) {
    return (
      <motion.div
        variants={pageVariants}
        initial="initial"
        animate="animate"
        transition={pageTransition}
        className="flex flex-col items-center justify-center h-full gap-4"
      >
        <Card className="border-[var(--color-border-light)] bg-[var(--color-bg-base)] shadow-none max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle className="font-[family-name:var(--font-display)] text-xl">
              Settings Unavailable
            </CardTitle>
            <CardDescription className="font-[family-name:var(--font-body)]">
              Settings require the Electron environment. This screen is only
              available when running the desktop app.
            </CardDescription>
          </CardHeader>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      transition={pageTransition}
      className="flex flex-col h-full overflow-hidden"
    >
      {/* Header */}
      <header className="flex-shrink-0 mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--color-text-primary)] m-0">
          Settings
        </h1>
        <p className="text-sm text-[var(--color-text-tertiary)] font-[family-name:var(--font-body)] mt-1">
          Configure your HiveMind OS environment.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center justify-center flex-1 gap-2 text-[var(--color-text-tertiary)]">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm font-[family-name:var(--font-body)]">
            Loading settings...
          </span>
        </div>
      ) : loadError ? (
        <div className="flex items-center justify-center flex-1">
          <Card className="border-[var(--color-border-light)] bg-[var(--color-bg-base)] shadow-none max-w-md w-full">
            <CardHeader className="text-center">
              <CardTitle className="font-[family-name:var(--font-display)] text-lg text-[var(--color-status-error-dot)]">
                Error Loading Settings
              </CardTitle>
              <CardDescription>{loadError}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      ) : (
        <Tabs defaultValue="general" className="flex-1 flex flex-col min-h-0">
          <TabsList className="flex-shrink-0 w-fit bg-[var(--color-bg-elevated)]">
            <TabsTrigger
              value="general"
              className="gap-1.5 font-[family-name:var(--font-body)]"
            >
              <Wifi size={14} />
              General
            </TabsTrigger>
            <TabsTrigger
              value="api-keys"
              className="gap-1.5 font-[family-name:var(--font-body)]"
            >
              <Server size={14} />
              Providers
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className="gap-1.5 font-[family-name:var(--font-body)]"
            >
              <Shield size={14} />
              Security
            </TabsTrigger>
            <TabsTrigger
              value="appearance"
              className="gap-1.5 font-[family-name:var(--font-body)]"
            >
              <SettingsIcon size={14} />
              Appearance
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto min-h-0 mt-4">
            <TabsContent value="general" className="mt-0">
              <GeneralTab settings={settings} onUpdate={handleUpdate} />
            </TabsContent>

            <TabsContent value="api-keys" className="mt-0">
              <ProvidersTab />
            </TabsContent>

            <TabsContent value="security" className="mt-0">
              <SecurityTab settings={settings} onUpdate={handleUpdate} />
            </TabsContent>

            <TabsContent value="appearance" className="mt-0">
              <AppearanceTab settings={settings} onUpdate={handleUpdate} />
            </TabsContent>
          </div>
        </Tabs>
      )}
    </motion.div>
  );
}
