import { motion } from "framer-motion";
import Titlebar from "../layout/Titlebar";

export function AuthLayout({ children }) {
  return (
    <div className="flex flex-col w-screen h-screen bg-[var(--color-bg-surface)] overflow-hidden">
      <Titlebar />
      <div className="flex-1 flex items-center justify-center p-6 relative">
        {/* Subtle background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--color-border-light)] rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--color-border-medium)] rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-md relative z-10"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
