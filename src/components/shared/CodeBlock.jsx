import { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function CodeBlock({
  children,
  showCopy = true,
  language = "",
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed silently
    }
  };

  return (
    <div
      style={{
        position: "relative",
        background: "var(--color-bg-surface)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border-light)",
        overflow: "hidden",
      }}
    >
      {language && (
        <div
          style={{
            padding: "4px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-2xs)",
            color: "var(--color-text-tertiary)",
            borderBottom: "1px solid var(--color-border-light)",
            background: "var(--color-bg-elevated)",
          }}
        >
          {language}
        </div>
      )}
      <pre
        style={{
          margin: 0,
          padding: "12px 16px",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-sm)",
          lineHeight: 1.6,
          color: "var(--color-text-secondary)",
          overflowX: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        <code>{children}</code>
      </pre>
      {showCopy && (
        <button
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code"}
          style={{
            position: "absolute",
            top: language ? 32 : 8,
            right: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: "var(--radius-sm)",
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-light)",
            color: "var(--color-text-tertiary)",
            cursor: "pointer",
            transition: "all var(--dur-fast) var(--ease-smooth)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--color-text-primary)";
            e.currentTarget.style.borderColor = "var(--color-border-medium)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--color-text-tertiary)";
            e.currentTarget.style.borderColor = "var(--color-border-light)";
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
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      )}
    </div>
  );
}
