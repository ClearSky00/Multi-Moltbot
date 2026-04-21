import { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";

function MainPageFallback() {
  return (
    <div
      className="flex h-full min-h-[200px] items-center justify-center font-[var(--font-body)] text-[length:var(--text-sm)] text-[var(--color-text-tertiary)]"
      role="status"
      aria-live="polite"
    >
      Loading…
    </div>
  );
}

/**
 * Main shell outlet. Lazy route chunks suspend here (not at the app root), so the
 * sidebar/titlebar stay mounted. We avoid AnimatePresence mode="wait" around <Outlet />
 * — that pattern duplicates outlet subtrees during exit and often leaves a blank pane.
 */
export default function MainContent() {
  const location = useLocation();

  return (
    <main
      style={{
        flex: 1,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.2,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
        style={{
          height: "100%",
          overflow: "auto",
          padding: "var(--content-padding)",
        }}
      >
        <Suspense fallback={<MainPageFallback />}>
          <Outlet />
        </Suspense>
      </motion.div>
    </main>
  );
}
