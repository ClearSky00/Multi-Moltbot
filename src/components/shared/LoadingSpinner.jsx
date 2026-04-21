export default function LoadingSpinner({ size = 16, color }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        animation: "hivemind-spin 0.8s linear infinite",
      }}
    >
      <style>
        {`@keyframes hivemind-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
      </style>
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke={color || "var(--color-border-medium)"}
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M14.5 8a6.5 6.5 0 0 0-6.5-6.5"
        stroke={color || "var(--color-text-primary)"}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
