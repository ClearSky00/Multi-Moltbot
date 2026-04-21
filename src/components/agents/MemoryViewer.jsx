import { useState, useEffect, useCallback } from "react";
import { Calendar } from "lucide-react";
import {
  readMemory,
  readDailyLogs as readDailyLog,
} from "../../services/fileService";
import LoadingSpinner from "../shared/LoadingSpinner";
import EmptyState from "../shared/EmptyState";

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

export default function MemoryViewer({ agentId }) {
  const [memory, setMemory] = useState("");
  const [dailyLog, setDailyLog] = useState("");
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState("memory");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    readMemory(agentId)
      .then((result) => {
        if (!cancelled) {
          setMemory(result?.data?.content || "");
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("[MemoryViewer] Failed to load MEMORY.md:", err);
        if (!cancelled) {
          setMemory("");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const loadDailyLog = useCallback(
    async (date) => {
      setLoading(true);
      try {
        const result = await readDailyLog(agentId, date);
        const logs = result?.data?.logs;
        if (Array.isArray(logs) && logs.length > 0) {
          setDailyLog(logs[0].content || "");
        } else {
          setDailyLog("");
        }
      } catch (err) {
        console.error("[MemoryViewer] Failed to load daily log:", err);
        setDailyLog("");
      } finally {
        setLoading(false);
      }
    },
    [agentId],
  );

  useEffect(() => {
    if (activeView === "daily") {
      loadDailyLog(selectedDate);
    }
  }, [activeView, selectedDate, loadDailyLog]);

  const handleDateChange = useCallback((e) => {
    setSelectedDate(e.target.value);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: 2 }}>
          <button
            onClick={() => setActiveView("memory")}
            style={{
              padding: "6px 14px",
              borderRadius: "var(--radius-sm)",
              fontFamily: "var(--font-body)",
              fontSize: "var(--text-sm)",
              fontWeight: activeView === "memory" ? 500 : 400,
              color:
                activeView === "memory"
                  ? "var(--color-text-primary)"
                  : "var(--color-text-tertiary)",
              background:
                activeView === "memory"
                  ? "var(--color-bg-elevated)"
                  : "transparent",
              cursor: "pointer",
              transition: "all var(--dur-fast) var(--ease-smooth)",
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
            MEMORY.md
          </button>
          <button
            onClick={() => setActiveView("daily")}
            style={{
              padding: "6px 14px",
              borderRadius: "var(--radius-sm)",
              fontFamily: "var(--font-body)",
              fontSize: "var(--text-sm)",
              fontWeight: activeView === "daily" ? 500 : 400,
              color:
                activeView === "daily"
                  ? "var(--color-text-primary)"
                  : "var(--color-text-tertiary)",
              background:
                activeView === "daily"
                  ? "var(--color-bg-elevated)"
                  : "transparent",
              cursor: "pointer",
              transition: "all var(--dur-fast) var(--ease-smooth)",
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
            Daily Logs
          </button>
        </div>

        {activeView === "daily" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Calendar
              size={14}
              style={{ color: "var(--color-text-tertiary)" }}
            />
            <input
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              max={formatDate(new Date())}
              style={{
                padding: "4px 8px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-border-medium)",
                background: "var(--color-bg-base)",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                color: "var(--color-text-secondary)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline =
                  "2px solid var(--color-text-primary)";
                e.currentTarget.style.outlineOffset = "2px";
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = "none";
              }}
            />
          </div>
        )}
      </div>

      {loading ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 48,
          }}
        >
          <LoadingSpinner size={20} />
        </div>
      ) : (
        <div
          style={{
            padding: 16,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border-light)",
            background: "var(--color-bg-surface)",
            minHeight: 200,
            maxHeight: 500,
            overflowY: "auto",
          }}
        >
          {(activeView === "memory" ? memory : dailyLog) ? (
            <pre
              style={{
                margin: 0,
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-sm)",
                lineHeight: 1.6,
                color: "var(--color-text-secondary)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {activeView === "memory" ? memory : dailyLog}
            </pre>
          ) : (
            <EmptyState
              title={
                activeView === "memory"
                  ? "No memory data"
                  : "No log for this date"
              }
              description={
                activeView === "memory"
                  ? "This agent has not written any memory entries yet."
                  : "Select a different date to view daily logs."
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
