const variantStyles = {
  default: {
    background: "var(--color-bg-elevated)",
    color: "var(--color-text-secondary)",
    border: "1px solid var(--color-border-light)",
  },
  success: {
    background: "var(--color-status-success-bg)",
    color: "var(--color-status-success-text)",
    border: "1px solid transparent",
  },
  warning: {
    background: "var(--color-status-warning-bg)",
    color: "var(--color-status-warning-text)",
    border: "1px solid transparent",
  },
  error: {
    background: "var(--color-status-error-bg)",
    color: "var(--color-status-error-text)",
    border: "1px solid transparent",
  },
};

export default function Badge({ label, variant = "default", style = {} }) {
  const vStyle = variantStyles[variant] || variantStyles.default;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "var(--radius-full)",
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-xs)",
        fontWeight: 500,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        ...vStyle,
        ...style,
      }}
    >
      {label}
    </span>
  );
}
