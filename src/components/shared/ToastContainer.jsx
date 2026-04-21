import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import useToastStore from '../../store/toastStore';

const TYPE_CONFIG = {
  success: {
    icon: CheckCircle2,
    borderColor: 'var(--color-status-success-dot)',
    iconColor: 'var(--color-status-success-dot)',
  },
  error: {
    icon: AlertCircle,
    borderColor: 'var(--color-status-error-dot)',
    iconColor: 'var(--color-status-error-dot)',
  },
  warning: {
    icon: AlertTriangle,
    borderColor: 'var(--color-status-warning-dot)',
    iconColor: 'var(--color-status-warning-dot)',
  },
  info: {
    icon: Info,
    borderColor: 'var(--color-border-accent)',
    iconColor: 'var(--color-text-secondary)',
  },
};

function ToastItem({ toast }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const progressRef = useRef(null);
  const config = TYPE_CONFIG[toast.type] || TYPE_CONFIG.info;
  const Icon = config.icon;

  useEffect(() => {
    if (toast.persistent || toast.duration <= 0) return;
    const el = progressRef.current;
    if (!el) return;
    el.style.transition = `width ${toast.duration}ms linear`;
    // Trigger reflow before starting animation
    void el.offsetWidth;
    el.style.width = '0%';
  }, [toast.duration, toast.persistent]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 48, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 48, scale: 0.96 }}
      transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{
        borderLeft: `3px solid ${config.borderColor}`,
        backgroundColor: 'var(--color-bg-elevated)',
        border: `1px solid var(--color-border-light)`,
        borderLeftColor: config.borderColor,
        borderLeftWidth: '3px',
        borderRadius: '6px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
        overflow: 'hidden',
        width: '340px',
        position: 'relative',
      }}
    >
      <div style={{ padding: '12px 14px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <Icon
          style={{ width: '15px', height: '15px', color: config.iconColor, flexShrink: 0, marginTop: '1px' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          {toast.title && (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                marginBottom: toast.message ? '2px' : 0,
                lineHeight: 1.3,
              }}
            >
              {toast.title}
            </p>
          )}
          {toast.message && (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '12px',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.4,
              }}
            >
              {toast.message}
            </p>
          )}
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action.onClick();
                removeToast(toast.id);
              }}
              style={{
                marginTop: '6px',
                fontFamily: 'var(--font-body)',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => removeToast(toast.id)}
          aria-label="Dismiss notification"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px',
            color: 'var(--color-text-tertiary)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X style={{ width: '13px', height: '13px' }} />
        </button>
      </div>

      {!toast.persistent && toast.duration > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '2px',
            backgroundColor: 'var(--color-border-light)',
          }}
        >
          <div
            ref={progressRef}
            style={{
              height: '100%',
              width: '100%',
              backgroundColor: config.borderColor,
              opacity: 0.5,
            }}
          />
        </div>
      )}
    </motion.div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      style={{
        position: 'fixed',
        top: '48px',
        right: '16px',
        zIndex: 9000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: 'auto' }}>
            <ToastItem toast={toast} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
