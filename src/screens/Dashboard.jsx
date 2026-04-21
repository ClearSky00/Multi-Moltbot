import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useAgentStore from '../store/agentStore';
import GoalInput from '../components/dashboard/GoalInput';
import TaskProgress from '../components/dashboard/TaskProgress';
import AgentGrid from '../components/dashboard/AgentGrid';
import ActivityFeed from '../components/dashboard/ActivityFeed';
import OrchestratorDialogue from '../components/dashboard/OrchestratorDialogue';
import TaskApproval from '../components/dashboard/TaskApproval';
import AgentChat from '../components/agents/AgentChat';
import QuotaExhaustedBanner from '../components/shared/QuotaExhaustedBanner';

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const pageTransition = {
  duration: 0.42,
  ease: [0.25, 0.46, 0.45, 0.94],
};

export default function Dashboard() {
  const isRunning = useAgentStore((s) => s.isRunning);
  const agents = useAgentStore((s) => s.agents);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);
  const awaitingInputTaskId = useAgentStore((s) => s.awaitingInputTaskId);
  const setAwaitingInputTask = useAgentStore((s) => s.setAwaitingInputTask);
  const awaitingApprovalTask = useAgentStore((s) => s.awaitingApprovalTask);
  const setAwaitingApprovalTask = useAgentStore((s) => s.setAwaitingApprovalTask);

  // Selected agent for feed filtering (null = show all)
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  // Agent targeted for direct chat from the Dashboard (null = no chat open)
  const [chatAgentId, setChatAgentId] = useState(null);

  const isTaskActive = isRunning || !!awaitingInputTaskId || !!awaitingApprovalTask;

  useEffect(() => {
    if (Object.keys(agents).length === 0) {
      fetchAgents();
    }
  }, [agents, fetchAgents]);

  // Clear agent filter and chat when task ends
  useEffect(() => {
    if (!isTaskActive) {
      setSelectedAgentId(null);
      setChatAgentId(null);
    }
  }, [isTaskActive]);

  const handleAgentSelect = useCallback((agentId) => {
    setSelectedAgentId((prev) => (prev === agentId ? null : agentId));
    setChatAgentId((prev) => (prev === agentId ? null : agentId));
  }, []);

  // The task control panel (right column or full-width when idle)
  const taskPanel = (
    <AnimatePresence mode="wait">
      {awaitingApprovalTask ? (
        <motion.div
          key="task-approval"
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.99 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        >
          <TaskApproval
            taskId={awaitingApprovalTask.taskId}
            result={awaitingApprovalTask.result}
            onDismiss={() => setAwaitingApprovalTask(null)}
          />
        </motion.div>
      ) : awaitingInputTaskId ? (
        <motion.div
          key="dialogue"
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.99 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        >
          <OrchestratorDialogue
            taskId={awaitingInputTaskId}
            onDismiss={() => setAwaitingInputTask(null)}
          />
        </motion.div>
      ) : isRunning ? (
        <motion.div
          key="task-progress"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.26, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <TaskProgress />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex flex-col h-full overflow-hidden"
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 mb-4">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-[length:var(--text-2xl)] font-semibold text-[color:var(--color-text-primary)] leading-tight m-0">
            Dashboard
          </h1>
          <span
            className="font-body text-xs text-[color:var(--color-text-tertiary)] hidden sm:inline"
          >
            {isTaskActive ? (
              <span className="font-mono text-[10px] tracking-widest uppercase">
                Task in progress
              </span>
            ) : (
              'Type a goal · agents execute autonomously'
            )}
          </span>
        </div>
      </header>

      <div className="shrink-0">
        <QuotaExhaustedBanner />
      </div>

      <AnimatePresence mode="wait">
        {isTaskActive ? (
          /* ── Running: Two-column layout ─────────────────────────────────── */
          <motion.div
            key="running-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="flex flex-1 min-h-0 gap-4"
          >
            {/* Left column: Agent Fleet + Activity Feed */}
            <div className="flex flex-col flex-1 min-w-0 min-h-0">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <p className="font-body text-[10px] font-medium uppercase tracking-wider text-[color:var(--color-text-tertiary)]">
                  Agent Fleet
                  {selectedAgentId && (
                    <span className="ml-1 text-[color:var(--color-text-primary)]">
                      — {agents[selectedAgentId]?.name || selectedAgentId}
                    </span>
                  )}
                </p>
                {selectedAgentId && (
                  <button
                    onClick={() => setSelectedAgentId(null)}
                    className="font-body text-[10px] text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)] transition-colors duration-150 px-1.5 py-0.5 rounded hover:bg-[color:var(--color-bg-elevated)]"
                  >
                    Show all ×
                  </button>
                )}
              </div>

              {/* Agent grid — compact 2-col layout to save vertical space */}
              <div className="shrink-0 mb-3">
                <AgentGrid
                  compact
                  selectedAgentId={selectedAgentId}
                  onAgentSelect={handleAgentSelect}
                />
              </div>

              {/* Activity feed fills remaining height */}
              <div className="flex-1 min-h-0">
                <ActivityFeed filterAgentId={selectedAgentId} />
              </div>
            </div>

            {/* Right column: Mission Control (task control panel + agent chat) */}
            <div className="w-[380px] shrink-0 flex flex-col min-h-0">
              <p className="font-body text-[10px] font-medium uppercase tracking-wider text-[color:var(--color-text-tertiary)] mb-2 shrink-0">
                Mission Control
              </p>
              <div className="flex-1 min-h-0 overflow-auto">
                {taskPanel}

                {/* Agent direct chat — visible when an agent card is clicked during a task */}
                <AnimatePresence>
                  {chatAgentId && isRunning && agents[chatAgentId] && (
                    <motion.div
                      key={`chat-${chatAgentId}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
                      className="mt-3 pt-3"
                      style={{
                        borderTop: '1px solid var(--color-border-light)',
                        minHeight: 280,
                        maxHeight: 380,
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <div className="flex items-center justify-between mb-2 shrink-0">
                        <p className="font-body text-[10px] font-medium uppercase tracking-wider text-[color:var(--color-text-tertiary)]">
                          Chat with {agents[chatAgentId]?.name || chatAgentId}
                        </p>
                        <button
                          onClick={() => setChatAgentId(null)}
                          className="font-body text-[10px] text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)] transition-colors duration-150 px-1.5 py-0.5 rounded hover:bg-[color:var(--color-bg-elevated)]"
                        >
                          Close
                        </button>
                      </div>
                      <div className="flex-1 min-h-0">
                        <AgentChat
                          agentId={chatAgentId}
                          agentName={agents[chatAgentId]?.name || chatAgentId}
                          status={agents[chatAgentId]?.status || 'idle'}
                          compact
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        ) : (
          /* ── Idle: Single-column layout ─────────────────────────────────── */
          <motion.div
            key="idle-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="shrink-0 mb-5">
              <GoalInput />
            </div>

            <div className="flex-1 min-h-0 overflow-auto mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-body text-[10px] font-medium uppercase tracking-wider text-[color:var(--color-text-tertiary)]">
                  Agent Fleet
                </p>
              </div>
              <AgentGrid />
            </div>

            <div className="shrink-0 h-[240px] border-t border-[color:var(--color-border-light)]">
              <ActivityFeed />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
