import { motion } from "framer-motion";

const statusStyles = {
  idle: {
    background: "var(--color-status-idle-dot)",
  },
  running: {
    background: "var(--color-status-running-dot)",
  },
  queued: {
    background: "var(--color-status-paused-dot)",
  },
  error: {
    background: "var(--color-status-error-dot)",
  },
  paused: {
    background: "var(--color-status-paused-dot)",
  },
  success: {
    background: "var(--color-status-success-dot)",
  },
};

export default function StatusDot({ status = "idle", size = 8 }) {
  const dotStyle = statusStyles[status] || statusStyles.idle;

  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      {status === "running" && (
        <motion.span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "var(--radius-full)",
            background: dotStyle.background,
            opacity: 0.4,
          }}
          animate={{
            scale: [1, 1.8, 1],
            opacity: [0.4, 0, 0.4],
          }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}
      <span
        style={{
          display: "block",
          width: size,
          height: size,
          borderRadius: "var(--radius-full)",
          ...dotStyle,
        }}
      />
    </span>
  );
}
