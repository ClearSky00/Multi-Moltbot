import { useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * Displays build output with auto-scroll and copy-to-clipboard.
 * For running builds, listens to chat:message events (filtered by taskId)
 * and appends new lines in real time.
 *
 * @param {{ output: string|null, taskId: string|null, isRunning: boolean }} props
 */
export default function BuildOutput({ output, taskId, isRunning }) {
  const [lines, setLines] = useState(() => splitLines(output));
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const copiedTimerRef = useRef(null);

  // Reset when build changes
  useEffect(() => {
    setLines(splitLines(output));
  }, [output]);

  // Stream new lines from chat:message events while build is running
  useEffect(() => {
    if (!isRunning || !taskId || !window.hivemind?.on) return;

    const cleanup = window.hivemind.on('chat:message', (data) => {
      if (!data) return;
      // Only append messages related to this task's build
      const msgTaskId = data.taskId || data.task_id;
      if (msgTaskId && msgTaskId !== taskId) return;
      const text = data.text || data.content || data.message;
      if (!text) return;
      setLines((prev) => [...prev, ...splitLines(text)]);
    });

    return cleanup;
  }, [isRunning, taskId]);

  // Auto-scroll to bottom when lines change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [lines]);

  const handleCopy = () => {
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  };

  if (lines.length === 0) return null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy output"
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-light)',
          borderRadius: '4px',
          padding: '3px 6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          zIndex: 1,
        }}
      >
        {copied ? (
          <Check style={{ width: '12px', height: '12px', color: 'var(--color-status-success-dot)' }} />
        ) : (
          <Copy style={{ width: '12px', height: '12px', color: 'var(--color-text-tertiary)' }} />
        )}
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '10px',
            color: copied ? 'var(--color-status-success-dot)' : 'var(--color-text-tertiary)',
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </span>
      </button>

      <div
        ref={containerRef}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          lineHeight: 1.6,
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-light)',
          borderRadius: '6px',
          padding: '12px',
          maxHeight: '360px',
          overflowY: 'auto',
          wordBreak: 'break-all',
          whiteSpace: 'pre-wrap',
          color: 'var(--color-text-secondary)',
        }}
      >
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'flex', gap: '12px' }}>
            <span
              style={{
                color: 'var(--color-text-disabled)',
                userSelect: 'none',
                minWidth: '2ch',
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              {i + 1}
            </span>
            <span style={{ flex: 1 }}>{line || '\u00A0'}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function splitLines(text) {
  if (!text) return [];
  return text.split('\n');
}
