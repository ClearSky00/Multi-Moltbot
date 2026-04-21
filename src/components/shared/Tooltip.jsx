import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function Tooltip({ children, content, position = "above" }) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef(null);

  const show = useCallback(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), 300);
  }, []);

  const hide = useCallback(() => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  const isAbove = position === "above";

  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      <AnimatePresence>
        {visible && content && (
          <motion.span
            initial={{ opacity: 0, y: isAbove ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: isAbove ? 4 : -4 }}
            transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
            role="tooltip"
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              ...(isAbove
                ? { bottom: "calc(100% + 6px)" }
                : { top: "calc(100% + 6px)" }),
              padding: "4px 10px",
              borderRadius: "var(--radius-sm)",
              background: "var(--color-text-primary)",
              color: "var(--color-text-inverse)",
              fontFamily: "var(--font-body)",
              fontSize: "var(--text-xs)",
              fontWeight: 400,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 9999,
              boxShadow: "var(--shadow-card)",
            }}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
