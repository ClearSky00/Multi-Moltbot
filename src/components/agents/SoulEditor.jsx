import { useState, useEffect, useCallback } from "react";
import { Save } from "lucide-react";
import { readSoul, writeSoul } from "../../services/fileService";
import MarkdownEditor from "../shared/MarkdownEditor";
import LoadingSpinner from "../shared/LoadingSpinner";

export default function SoulEditor({ agentId }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    readSoul(agentId)
      .then((result) => {
        if (!cancelled) {
          setContent(result?.data?.content || "");
          setLoading(false);
          setDirty(false);
        }
      })
      .catch((err) => {
        console.error("[SoulEditor] Failed to load SOUL.md:", err);
        if (!cancelled) {
          setContent("");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const handleChange = useCallback((val) => {
    setContent(val);
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await writeSoul(agentId, content);
      setDirty(false);
    } catch (err) {
      console.error("[SoulEditor] Failed to save SOUL.md:", err);
    } finally {
      setSaving(false);
    }
  }, [agentId, content]);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 48,
        }}
      >
        <LoadingSpinner size={20} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-lg)",
            fontWeight: 400,
            color: "var(--color-text-primary)",
            margin: 0,
          }}
        >
          SOUL.md
        </h3>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: "var(--radius-md)",
            background: dirty
              ? "var(--color-btn-primary-bg)"
              : "var(--color-bg-elevated)",
            color: dirty
              ? "var(--color-btn-primary-text)"
              : "var(--color-text-disabled)",
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            cursor: dirty ? "pointer" : "not-allowed",
            transition: "all var(--dur-fast) var(--ease-smooth)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.outline =
              "2px solid var(--color-text-primary)";
            e.currentTarget.style.outlineOffset = "2px";
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = "none";
          }}
        >
          {saving ? <LoadingSpinner size={14} /> : <Save size={14} />}
          Save
        </button>
      </div>

      <MarkdownEditor
        value={content}
        onChange={handleChange}
        placeholder="# Agent Soul\n\nDefine this agent's identity, capabilities, and boundaries..."
      />
    </div>
  );
}
