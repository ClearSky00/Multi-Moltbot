import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, RefreshCw, Settings, Loader2 } from 'lucide-react';
import { useState } from 'react';
import useTaskStore from '../../store/taskStore';

/**
 * Banner shown on the Dashboard when one or more tasks have status === 'quota_exhausted'.
 * Displays the first paused task and offers Resume + Settings navigation.
 */
export default function QuotaExhaustedBanner() {
  const navigate = useNavigate();
  const tasks = useTaskStore((s) => s.tasks);
  const resumeTask = useTaskStore((s) => s.resumeTask);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState(null);

  const quotaTasks = tasks.filter((t) => t.status === 'quota_exhausted');
  const firstTask = quotaTasks[0];

  const handleResume = async () => {
    if (!firstTask || resuming) return;
    setResuming(true);
    setResumeError(null);
    const result = await resumeTask(firstTask.id);
    setResuming(false);
    if (result?.error) {
      setResumeError(result.error);
    }
  };

  return (
    <AnimatePresence>
      {quotaTasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{
            backgroundColor: '#FBF7EE',
            border: '1px solid var(--color-status-warning-dot)',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <AlertTriangle
            style={{
              width: '16px',
              height: '16px',
              color: 'var(--color-status-warning-dot)',
              flexShrink: 0,
              marginTop: '1px',
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 600,
                color: '#6B5114',
                marginBottom: '2px',
              }}
            >
              API quota exhausted —{' '}
              {quotaTasks.length === 1 ? '1 task paused' : `${quotaTasks.length} tasks paused`}
            </p>
            {firstTask && (
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  color: '#8A6B1A',
                  marginBottom: '8px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                "{firstTask.goal}"
              </p>
            )}
            {resumeError && (
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '11px',
                  color: 'var(--color-status-error-dot)',
                  marginBottom: '6px',
                }}
              >
                {resumeError}
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleResume}
                disabled={resuming}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#6B5114',
                  backgroundColor: 'rgba(138, 107, 26, 0.12)',
                  border: '1px solid rgba(138, 107, 26, 0.3)',
                  borderRadius: '5px',
                  padding: '4px 10px',
                  cursor: resuming ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  opacity: resuming ? 0.7 : 1,
                }}
              >
                {resuming ? (
                  <Loader2 style={{ width: '12px', height: '12px', animation: 'spin 0.8s linear infinite' }} />
                ) : (
                  <RefreshCw style={{ width: '12px', height: '12px' }} />
                )}
                {resuming ? 'Resuming…' : 'Resume task'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/settings')}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#8A6B1A',
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(138, 107, 26, 0.2)',
                  borderRadius: '5px',
                  padding: '4px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Settings style={{ width: '12px', height: '12px' }} />
                Update API keys
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
