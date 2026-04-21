import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  Save,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
  Star,
  Zap,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useProviderStore } from "../../store/providerStore";

// ---------------------------------------------------------------------------
// Provider type metadata
// ---------------------------------------------------------------------------
const PROVIDER_META = {
  gemini: { label: "Gemini", color: "#1A73E8", needsKey: true, needsUrl: false },
  openai: { label: "OpenAI", color: "#10A37F", needsKey: true, needsUrl: false },
  anthropic: { label: "Anthropic", color: "#D4A853", needsKey: true, needsUrl: false },
  ollama: { label: "Ollama", color: "#6B7280", needsKey: false, needsUrl: true },
  "openai-compatible": { label: "OpenAI-Compatible", color: "#7C3AED", needsKey: false, needsUrl: true },
};

// ---------------------------------------------------------------------------
// Small hook for 2-second "saved" flash
// ---------------------------------------------------------------------------
function useSavedFlash() {
  const [saved, setSaved] = useState(false);
  const flash = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, []);
  return [saved, flash];
}

// ---------------------------------------------------------------------------
// ProviderCard
// ---------------------------------------------------------------------------
export function ProviderCard({ provider, isDefault, onDelete }) {
  const { upsertProvider, saveKey, deleteKey, testConnection, fetchModels, setDefault } =
    useProviderStore();

  const meta = PROVIDER_META[provider.type] ?? { label: provider.type, needsKey: true, needsUrl: false };

  // Name editing
  const [name, setName] = useState(provider.name);
  const [nameSaved, flashNameSaved] = useSavedFlash();
  const [nameSaving, setNameSaving] = useState(false);

  // Base URL
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl || "");
  const [urlSaved, flashUrlSaved] = useSavedFlash();
  const [urlSaving, setUrlSaving] = useState(false);

  // API Key
  const [keyValue, setKeyValue] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [keySaving, setKeySaving] = useState(false);
  const [keySaved, flashKeySaved] = useSavedFlash();
  const [keyError, setKeyError] = useState("");
  const keyStatus = provider.keyStatus ?? { exists: false, masked: null };

  // Test connection
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, latencyMs, error? }

  // Fetch models
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelsError, setModelsError] = useState("");

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ---- Handlers ----

  const handleSaveName = async () => {
    if (!name.trim() || name.trim() === provider.name) return;
    setNameSaving(true);
    try {
      await upsertProvider({ ...provider, name: name.trim() });
      flashNameSaved();
    } finally {
      setNameSaving(false);
    }
  };

  const handleToggleEnabled = async (enabled) => {
    await upsertProvider({ ...provider, enabled });
  };

  const handleSaveUrl = async () => {
    if (baseUrl === provider.baseUrl) return;
    setUrlSaving(true);
    try {
      await upsertProvider({ ...provider, baseUrl });
      flashUrlSaved();
      setTestResult(null);
    } finally {
      setUrlSaving(false);
    }
  };

  const handleSaveKey = async () => {
    if (!keyValue.trim()) return;
    setKeySaving(true);
    setKeyError("");
    try {
      await saveKey(provider.id, keyValue.trim());
      setKeyValue("");
      setKeyVisible(false);
      flashKeySaved();
      setTestResult(null);
    } catch (err) {
      setKeyError(err.message || "Failed to save key");
    } finally {
      setKeySaving(false);
    }
  };

  const handleDeleteKey = async () => {
    await deleteKey(provider.id);
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection(provider.id);
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleFetchModels = async () => {
    setFetchingModels(true);
    setModelsError("");
    try {
      await fetchModels(provider.id);
    } catch (err) {
      setModelsError(err.message || "Failed to fetch models");
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSetDefault = async () => {
    await setDefault(provider.id);
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    setDeleting(true);
    try {
      await onDelete(provider.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="border-[var(--color-border-medium)] bg-[var(--color-bg-base)] shadow-none">
      {/* ---- Header ---- */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: meta.color }}
            />
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                className="h-7 text-sm font-semibold font-[family-name:var(--font-body)] border-transparent bg-transparent hover:bg-[var(--color-bg-surface)] focus:bg-[var(--color-bg-surface)] px-2 min-w-0"
              />
              {nameSaving && <Loader2 size={12} className="animate-spin text-[var(--color-text-tertiary)] flex-shrink-0" />}
              {nameSaved && <CheckCircle2 size={12} className="text-[var(--color-status-success-dot)] flex-shrink-0" />}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge
              variant="outline"
              className="text-[10px] font-[family-name:var(--font-mono)] border-[var(--color-border-medium)]"
            >
              {meta.label}
            </Badge>

            {isDefault && (
              <Badge className="text-[10px] bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border border-[var(--color-border-medium)]">
                Default
              </Badge>
            )}

            <Switch
              checked={provider.enabled}
              onCheckedChange={handleToggleEnabled}
              aria-label="Enable provider"
            />

            <button
              onClick={handleDelete}
              disabled={deleting}
              className={`text-[var(--color-text-tertiary)] hover:text-[var(--color-status-error-dot)] transition-colors ${
                confirmDelete ? "text-[var(--color-status-error-dot)]" : ""
              }`}
              aria-label={confirmDelete ? "Click again to confirm delete" : "Delete provider"}
              title={confirmDelete ? "Click again to confirm" : "Delete provider"}
            >
              {deleting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* ---- Base URL (Ollama / OpenAI-compatible) ---- */}
        {meta.needsUrl && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs font-[family-name:var(--font-body)] text-[var(--color-text-secondary)]">
                Base URL
              </Label>
              <div className="flex gap-2">
                <Input
                  value={baseUrl}
                  onChange={(e) => {
                    setBaseUrl(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="http://localhost:11434"
                  className="font-[family-name:var(--font-mono)] text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveUrl}
                  disabled={urlSaving || baseUrl === provider.baseUrl}
                >
                  {urlSaving ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : urlSaved ? (
                    <CheckCircle2 size={13} />
                  ) : (
                    <Save size={13} />
                  )}
                </Button>
              </div>
            </div>
            <Separator className="bg-[var(--color-border-light)]" />
          </>
        )}

        {/* ---- API Key ---- */}
        {meta.needsKey && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-[family-name:var(--font-body)] text-[var(--color-text-secondary)]">
                  API Key
                </Label>
                <div className="flex items-center gap-2">
                  {keyStatus.exists && (
                    <>
                      <span className="text-[10px] font-[family-name:var(--font-mono)] text-[var(--color-text-tertiary)]">
                        {keyStatus.masked}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] text-[var(--color-status-success-dot)] border-[var(--color-status-success-dot)]/30"
                      >
                        Configured
                      </Badge>
                      <button
                        onClick={handleDeleteKey}
                        className="text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-status-error-dot)] transition-colors font-[family-name:var(--font-body)]"
                        title="Remove key"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={keyVisible ? "text" : "password"}
                    value={keyValue}
                    onChange={(e) => {
                      setKeyValue(e.target.value);
                      setKeyError("");
                    }}
                    placeholder={keyStatus.exists ? "(replace existing key)" : "Enter API key"}
                    className="pr-9 font-[family-name:var(--font-mono)] text-xs"
                    onKeyDown={(e) => e.key === "Enter" && handleSaveKey()}
                  />
                  <button
                    type="button"
                    onClick={() => setKeyVisible((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                    aria-label={keyVisible ? "Hide key" : "Show key"}
                  >
                    {keyVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveKey}
                  disabled={keySaving || !keyValue.trim()}
                >
                  {keySaving ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : keySaved ? (
                    <CheckCircle2 size={13} />
                  ) : (
                    <Save size={13} />
                  )}
                  {keySaved ? "Saved" : "Save"}
                </Button>
              </div>

              <AnimatePresence>
                {keyError && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-xs text-[var(--color-status-error-dot)] flex items-center gap-1 font-[family-name:var(--font-body)]"
                  >
                    <AlertCircle size={11} />
                    {keyError}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            <Separator className="bg-[var(--color-border-light)]" />
          </>
        )}

        {/* ---- Test + Actions row ---- */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={handleTest}
            disabled={testing}
            className="font-[family-name:var(--font-body)] text-xs"
          >
            {testing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Zap size={13} />
            )}
            Test Connection
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleFetchModels}
            disabled={fetchingModels}
            className="font-[family-name:var(--font-body)] text-xs"
          >
            {fetchingModels ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Fetch Models
          </Button>

          {!isDefault && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSetDefault}
              className="font-[family-name:var(--font-body)] text-xs"
            >
              <Star size={13} />
              Set as Default
            </Button>
          )}

          {/* Test result inline */}
          <AnimatePresence>
            {testResult && (
              <motion.div
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1.5 text-xs font-[family-name:var(--font-body)]"
              >
                {testResult.ok ? (
                  <>
                    <CheckCircle2 size={13} className="text-[var(--color-status-success-dot)]" />
                    <span className="text-[var(--color-status-success-dot)]">
                      Connected {testResult.latencyMs != null ? `(${testResult.latencyMs}ms)` : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle size={13} className="text-[var(--color-status-error-dot)]" />
                    <span className="text-[var(--color-status-error-dot)]">
                      {testResult.error || "Failed"}
                    </span>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ---- Models list ---- */}
        <AnimatePresence>
          {modelsError && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="text-xs text-[var(--color-status-error-dot)] flex items-center gap-1 font-[family-name:var(--font-body)]"
            >
              <AlertCircle size={11} />
              {modelsError}
            </motion.p>
          )}
        </AnimatePresence>

        {provider.models?.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-[var(--color-text-tertiary)] font-[family-name:var(--font-body)] uppercase tracking-wide">
              Available Models
            </p>
            <div className="flex flex-wrap gap-1.5">
              {provider.models.map((m) => (
                <Badge
                  key={m}
                  variant="outline"
                  className="text-[10px] font-[family-name:var(--font-mono)] border-[var(--color-border-light)] text-[var(--color-text-secondary)]"
                >
                  {m}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ProviderCard;
