import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, MessageSquare, Info } from 'lucide-react';
import { messageAgent } from '../../services/openclaw';
import useAgentStore from '../../store/agentStore';

const MAX_CHARS = 1000;

const spring = { type: 'spring', stiffness: 340, damping: 28 };
const smooth = { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] };

/**
 * AgentChat — direct messaging interface for a single agent.
 *
 * Sends messages to the agent's running gateway session via chat.send.
 * Messages are persisted in agentStore so they survive component unmount.
 * Subscribes to incoming agent:message-received events for real-time responses.
 *
 * Props:
 *   agentId    — the agent to message
 *   agentName  — display name
 *   status     — agent status ('idle', 'running', 'paused', 'error')
 *   compact    — compact layout for Dashboard embedding (optional)
 */
export default function AgentChat({ agentId, agentName, status, compact = false }) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Messages from Zustand store — persists across unmount
  const messages = useAgentStore((s) => s.agentMessages[agentId] || []);
  const addMessage = useAgentStore((s) => s.addAgentMessage);

  const isAgentActive = status === 'running' || status === 'paused';

  // Subscribe to incoming agent messages from the gateway
  useEffect(() => {
    if (!window.hivemind?.on) return undefined;

    const cleanup = window.hivemind.on('agent:message-received', (data) => {
      if (data?.agentId === agentId && data?.text) {
        // Avoid duplicating messages we already added from handleSend responses
        const recentMessages = useAgentStore.getState().agentMessages[agentId] || [];
        const lastMsg = recentMessages[recentMessages.length - 1];
        if (lastMsg?.role === 'agent' && lastMsg?.text === data.text) return;

        addMessage(agentId, {
          role: 'agent',
          text: data.text,
          timestamp: data.timestamp || Date.now(),
        });
      }
    });

    return cleanup;
  }, [agentId, addMessage]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    const userMsg = { role: 'user', text: trimmed, timestamp: Date.now() };
    addMessage(agentId, userMsg);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const result = await messageAgent(agentId, trimmed);

      if (result?.error) {
        setError(result.error);
        setSending(false);
        return;
      }

      // Extract response text from various payload shapes
      const responseText =
        result?.data?.result ||
        result?.data?.message ||
        result?.data?.text ||
        (typeof result?.data === 'string' ? result.data : null);

      if (responseText) {
        addMessage(agentId, { role: 'agent', text: responseText, timestamp: Date.now() });
      } else {
        addMessage(agentId, {
          role: 'system',
          text: 'Message delivered. The agent will process it asynchronously — watch the activity feed for output.',
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  }, [input, sending, agentId, addMessage]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const charPct = input.length / MAX_CHARS;
  const charWarning = charPct > 0.85;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Status notice */}
      {!isAgentActive && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2 px-3 py-2 mb-3 rounded-lg text-xs"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-light)',
            fontFamily: 'var(--font-body)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          <Info size={12} className="shrink-0 mt-0.5" />
          <span>
            {agentName} is <strong>{status || 'idle'}</strong>. Messages require an active
            session — start a task first, then message the agent while it&apos;s running.
          </span>
        </motion.div>
      )}

      {/* Message history */}
      <div className="flex-1 overflow-auto min-h-0 pr-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-10">
            <MessageSquare
              size={32}
              strokeWidth={1}
              style={{ color: 'var(--color-text-disabled)' }}
            />
            <div className="text-center">
              <p
                className="text-sm font-medium mb-1"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                Direct message {agentName}
              </p>
              <p
                className="text-xs max-w-[260px] leading-relaxed"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: 'var(--color-text-disabled)',
                }}
              >
                Send instructions or context directly to this agent&apos;s
                running session. Activity appears in the Dashboard feed.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 py-2">
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={smooth}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'system' ? (
                    <div
                      className="max-w-full text-xs px-3 py-2 rounded-lg italic"
                      style={{
                        background: 'var(--color-bg-surface)',
                        color: 'var(--color-text-tertiary)',
                        fontFamily: 'var(--font-body)',
                        border: '1px solid var(--color-border-light)',
                      }}
                    >
                      {msg.text}
                    </div>
                  ) : (
                    <div
                      className="max-w-[88%] rounded-xl px-3.5 py-2.5"
                      style={
                        msg.role === 'user'
                          ? {
                              background: 'var(--color-btn-primary-bg)',
                              color: 'var(--color-btn-primary-text)',
                            }
                          : {
                              background: 'var(--color-bg-elevated)',
                              color: 'var(--color-text-primary)',
                              border: '1px solid var(--color-border-light)',
                            }
                      }
                    >
                      {msg.role === 'agent' && (
                        <p
                          className="text-[9px] font-semibold uppercase tracking-widest mb-1 opacity-60"
                          style={{ fontFamily: 'var(--font-mono)' }}
                        >
                          {agentName}
                        </p>
                      )}
                      <p
                        className="text-[13px] leading-relaxed whitespace-pre-wrap"
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        {msg.text}
                      </p>
                      <span
                        className="text-[9px] opacity-40 mt-1 block"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {new Date(msg.timestamp).toLocaleTimeString('en-US', {
                          hour12: false,
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Sending indicator */}
            <AnimatePresence>
              {sending && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={smooth}
                  className="flex justify-start"
                >
                  <div
                    className="px-3.5 py-2.5 rounded-xl flex items-center gap-2"
                    style={{
                      background: 'var(--color-bg-elevated)',
                      border: '1px solid var(--color-border-light)',
                    }}
                  >
                    <Loader2
                      size={12}
                      className="animate-spin"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    />
                    <span
                      className="text-xs"
                      style={{
                        fontFamily: 'var(--font-body)',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      {agentName} processing…
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={smooth}
            className="text-xs px-1 py-1 shrink-0"
            style={{
              fontFamily: 'var(--font-body)',
              color: 'var(--color-status-error-dot)',
            }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div
        className="shrink-0 border-t pt-3 mt-2"
        style={{ borderColor: 'var(--color-border-light)' }}
      >
        <div
          className="flex items-end gap-2 px-3 py-2 rounded-lg"
          style={{
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-medium)',
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              if (e.target.value.length <= MAX_CHARS) setInput(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              isAgentActive
                ? `Message ${agentName}… (Enter to send)`
                : `${agentName} is not active — start a task first`
            }
            rows={2}
            disabled={sending || !isAgentActive}
            className="flex-1 resize-none text-[13px] leading-relaxed outline-none disabled:opacity-40 transition-opacity duration-200"
            style={{
              fontFamily: 'var(--font-body)',
              color: 'var(--color-text-primary)',
              background: 'transparent',
              caretColor: 'var(--color-text-primary)',
            }}
          />
          <div className="flex flex-col items-end gap-1 shrink-0">
            {charWarning && (
              <span
                className="text-[9px]"
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-status-warning-dot)',
                }}
              >
                {input.length}/{MAX_CHARS}
              </span>
            )}
            <motion.button
              onClick={handleSend}
              disabled={!input.trim() || sending || !isAgentActive}
              whileHover={{ scale: input.trim() && !sending && isAgentActive ? 1.04 : 1 }}
              whileTap={{ scale: 0.96 }}
              transition={smooth}
              className="p-1.5 rounded-lg transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background:
                  input.trim() && !sending && isAgentActive
                    ? 'var(--color-btn-primary-bg)'
                    : 'var(--color-bg-elevated)',
                color:
                  input.trim() && !sending && isAgentActive
                    ? 'var(--color-btn-primary-text)'
                    : 'var(--color-text-tertiary)',
              }}
              aria-label="Send message"
            >
              <AnimatePresence mode="wait">
                {sending ? (
                  <motion.span
                    key="spin"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={smooth}
                  >
                    <Loader2 size={13} className="animate-spin" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="send"
                    initial={{ opacity: 0, x: -3 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={smooth}
                  >
                    <Send size={13} />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
        <p
          className="text-[10px] mt-1.5 px-1"
          style={{
            fontFamily: 'var(--font-body)',
            color: 'var(--color-text-disabled)',
          }}
        >
          Enter to send · Shift+Enter for newline · Messages go to the agent&apos;s active session
        </p>
      </div>
    </div>
  );
}
