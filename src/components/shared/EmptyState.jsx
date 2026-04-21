import { motion } from "framer-motion";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        textAlign: "center",
      }}
    >
      {Icon && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 48,
            height: 48,
            borderRadius: "var(--radius-lg)",
            background: "var(--color-bg-elevated)",
            color: "var(--color-text-tertiary)",
            marginBottom: 16,
          }}
        >
          <Icon size={24} />
        </div>
      )}
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-lg)",
          fontWeight: 400,
          color: "var(--color-text-primary)",
          margin: 0,
          marginBottom: 6,
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-sm)",
            color: "var(--color-text-tertiary)",
            margin: 0,
            marginBottom: actionLabel ? 20 : 0,
            maxWidth: 320,
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            padding: "8px 20px",
            borderRadius: "var(--radius-md)",
            background: "var(--color-btn-primary-bg)",
            color: "var(--color-btn-primary-text)",
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            cursor: "pointer",
            transition: "background var(--dur-fast) var(--ease-smooth)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--color-btn-primary-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--color-btn-primary-bg)";
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
          {actionLabel}
        </button>
      )}
    </motion.div>
  );
}
