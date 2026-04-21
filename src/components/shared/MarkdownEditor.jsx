import { useState, useCallback } from "react";
import { Eye, Edit3 } from "lucide-react";

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function processInline(line) {
  let result = escapeHtml(line);
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  result = result.replace(
    /`(.+?)`/g,
    '<code style="font-family:var(--font-mono);font-size:var(--text-sm);background:var(--color-bg-elevated);padding:1px 4px;border-radius:var(--radius-xs)">$1</code>',
  );
  return result;
}

function renderMarkdown(text) {
  if (!text) return "";
  const lines = text.split("\n");
  const html = [];
  let inCodeBlock = false;
  let codeContent = [];
  let inList = false;
  let listItems = [];

  const flushList = () => {
    if (inList && listItems.length > 0) {
      html.push('<ul style="margin:8px 0;padding-left:20px">');
      listItems.forEach((item) => {
        html.push(`<li style="margin:2px 0">${processInline(item)}</li>`);
      });
      html.push("</ul>");
      listItems = [];
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        html.push(
          `<pre style="background:var(--color-bg-surface);padding:12px;border-radius:var(--radius-md);font-family:var(--font-mono);font-size:var(--text-sm);overflow-x:auto;border:1px solid var(--color-border-light)"><code>${escapeHtml(codeContent.join("\n"))}</code></pre>`,
        );
        codeContent = [];
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }
    if (line.startsWith("### ")) {
      flushList();
      html.push(
        `<h3 style="font-family:var(--font-display);font-size:var(--text-lg);font-weight:400;margin:16px 0 8px">${processInline(line.slice(4))}</h3>`,
      );
    } else if (line.startsWith("## ")) {
      flushList();
      html.push(
        `<h2 style="font-family:var(--font-display);font-size:var(--text-xl);font-weight:600;margin:20px 0 10px">${processInline(line.slice(3))}</h2>`,
      );
    } else if (line.startsWith("# ")) {
      flushList();
      html.push(
        `<h1 style="font-family:var(--font-display);font-size:var(--text-2xl);font-weight:600;margin:24px 0 12px">${processInline(line.slice(2))}</h1>`,
      );
    } else if (/^[-*]\s/.test(line)) {
      inList = true;
      listItems.push(line.replace(/^[-*]\s/, ""));
    } else if (line.trim() === "") {
      flushList();
      html.push("<br/>");
    } else {
      flushList();
      html.push(`<p style="margin:6px 0">${processInline(line)}</p>`);
    }
  }
  flushList();
  if (inCodeBlock && codeContent.length > 0) {
    html.push(
      `<pre style="background:var(--color-bg-surface);padding:12px;border-radius:var(--radius-md);font-family:var(--font-mono);font-size:var(--text-sm);overflow-x:auto;border:1px solid var(--color-border-light)"><code>${escapeHtml(codeContent.join("\n"))}</code></pre>`,
    );
  }
  return html.join("");
}

// Renders only user-authored SOUL.md content (not untrusted external input).
// The escapeHtml function sanitizes all text before insertion.
function MarkdownPreview({ value }) {
  return (
    <div
      style={{
        padding: "16px",
        minHeight: 200,
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-base)",
        lineHeight: 1.6,
        color: "var(--color-text-primary)",
        overflowY: "auto",
      }}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
    />
  );
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write markdown...",
  readOnly = false,
}) {
  const [previewing, setPreviewing] = useState(false);

  const handleChange = useCallback(
    (e) => {
      if (onChange) onChange(e.target.value);
    },
    [onChange],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--color-border-medium)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        background: "var(--color-bg-base)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "4px 8px",
          borderBottom: "1px solid var(--color-border-light)",
          background: "var(--color-bg-surface)",
        }}
      >
        <button
          onClick={() => setPreviewing((p) => !p)}
          aria-label={previewing ? "Edit markdown" : "Preview markdown"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 8px",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-xs)",
            fontFamily: "var(--font-body)",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            transition: "background var(--dur-fast) var(--ease-smooth)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--color-bg-elevated)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
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
          {previewing ? <Edit3 size={13} /> : <Eye size={13} />}
          {previewing ? "Edit" : "Preview"}
        </button>
      </div>

      {previewing ? (
        <MarkdownPreview value={value} />
      ) : (
        <textarea
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          readOnly={readOnly}
          style={{
            width: "100%",
            minHeight: 200,
            padding: "16px",
            border: "none",
            outline: "none",
            resize: "vertical",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-sm)",
            lineHeight: 1.6,
            color: "var(--color-text-primary)",
            background: "var(--color-bg-base)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.outline =
              "2px solid var(--color-text-primary)";
            e.currentTarget.style.outlineOffset = "2px";
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = "none";
          }}
        />
      )}
    </div>
  );
}
