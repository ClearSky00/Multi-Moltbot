/**
 * Compact vertical timeline showing task state transitions.
 * Each node represents a lifecycle event with a timestamp.
 */

const STATUS_COLORS = {
  created:        'var(--color-text-tertiary)',
  running:        'var(--color-border-accent)',
  awaiting_input: 'var(--color-status-warning-dot)',
  quota_exhausted:'var(--color-status-warning-dot)',
  completed:      'var(--color-status-success-dot)',
  failed:         'var(--color-status-error-dot)',
  cancelled:      'var(--color-text-disabled)',
};

function formatTime(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Build timeline nodes from a task object.
 * @param {object} task
 * @returns {Array<{ label: string, color: string, time: string|null }>}
 */
function buildNodes(task) {
  const nodes = [
    { label: 'Created', color: STATUS_COLORS.created, time: formatTime(task.createdAt || task.created_at) },
  ];

  if (task.status === 'running' || task.status === 'completed' || task.status === 'failed') {
    nodes.push({ label: 'Running', color: STATUS_COLORS.running, time: null });
  }

  if (task.status === 'awaiting_input') {
    nodes.push({ label: 'Awaiting Input', color: STATUS_COLORS.awaiting_input, time: null });
  }

  if (task.status === 'quota_exhausted') {
    nodes.push({ label: 'Running', color: STATUS_COLORS.running, time: null });
    nodes.push({ label: 'Quota Exhausted', color: STATUS_COLORS.quota_exhausted, time: null });
  }

  if (task.status === 'completed') {
    nodes.push({
      label: 'Completed',
      color: STATUS_COLORS.completed,
      time: formatTime(task.completedAt || task.completed_at),
    });
  }

  if (task.status === 'failed') {
    nodes.push({
      label: 'Failed',
      color: STATUS_COLORS.failed,
      time: formatTime(task.completedAt || task.completed_at),
    });
  }

  if (task.status === 'cancelled') {
    nodes.push({
      label: 'Cancelled',
      color: STATUS_COLORS.cancelled,
      time: formatTime(task.completedAt || task.completed_at),
    });
  }

  return nodes;
}

export default function TaskTimeline({ task }) {
  const nodes = buildNodes(task);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, paddingLeft: '2px' }}>
      {nodes.map((node, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          {/* Left column: dot + connector line */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '10px', flexShrink: 0 }}>
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: node.color,
                flexShrink: 0,
                marginTop: '4px',
              }}
            />
            {i < nodes.length - 1 && (
              <div
                style={{
                  width: '1px',
                  flexGrow: 1,
                  minHeight: '14px',
                  backgroundColor: 'var(--color-border-light)',
                  marginTop: '2px',
                  marginBottom: '2px',
                }}
              />
            )}
          </div>

          {/* Right column: label + time */}
          <div
            style={{
              paddingBottom: i < nodes.length - 1 ? '10px' : 0,
              display: 'flex',
              alignItems: 'baseline',
              gap: '8px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                color: 'var(--color-text-secondary)',
              }}
            >
              {node.label}
            </span>
            {node.time && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {node.time}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
