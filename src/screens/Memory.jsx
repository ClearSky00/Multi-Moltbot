import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Brain, Calendar, User, FileText } from "lucide-react";
import useAgentStore from "../store/agentStore";
import { readMemory, readDailyLogs } from "../services/fileService";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { sortAgentsByPresetOrder } from "@/lib/agentDisplayOrder";
import { cn } from "@/lib/utils";

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const pageTransition = {
  duration: 0.42,
  ease: [0.25, 0.46, 0.45, 0.94],
};

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function Memory() {
  const agents = useAgentStore((s) => s.agents);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);

  const agentList = useMemo(
    () => sortAgentsByPresetOrder(Object.values(agents)),
    [agents],
  );

  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [memoryContent, setMemoryContent] = useState("");
  const [dailyLogs, setDailyLogs] = useState({});
  const [loadingMemory, setLoadingMemory] = useState(false);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [memoryError, setMemoryError] = useState(null);
  const [dailyError, setDailyError] = useState(null);

  useEffect(() => {
    if (agentList.length === 0) {
      fetchAgents();
    }
  }, [agentList.length, fetchAgents]);

  useEffect(() => {
    if (agentList.length > 0 && !selectedAgentId) {
      setSelectedAgentId(agentList[0].id);
    }
  }, [agentList, selectedAgentId]);

  const loadMemory = useCallback(async (agentId) => {
    if (!agentId) return;
    setLoadingMemory(true);
    setMemoryError(null);
    try {
      const result = await readMemory(agentId);
      const content = result?.data?.content ?? "";
      setMemoryContent(typeof content === "string" ? content : "");
    } catch (err) {
      console.error("[Memory] Failed to load MEMORY.md:", err);
      setMemoryError("Unable to load MEMORY.md");
      setMemoryContent("");
    } finally {
      setLoadingMemory(false);
    }
  }, []);

  const loadDailyLogs = useCallback(async (agentId) => {
    if (!agentId) return;
    setLoadingDaily(true);
    setDailyError(null);
    try {
      const result = await readDailyLogs(agentId);
      const logs = result?.data?.logs;
      if (Array.isArray(logs)) {
        const logMap = {};
        for (const log of logs) {
          if (log.date && log.content) {
            logMap[log.date] = log.content;
          }
        }
        setDailyLogs(logMap);
      } else {
        setDailyLogs({});
      }
    } catch (err) {
      console.error("[Memory] Failed to load daily logs:", err);
      setDailyError("Unable to load daily logs");
      setDailyLogs({});
    } finally {
      setLoadingDaily(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAgentId) {
      loadMemory(selectedAgentId);
      loadDailyLogs(selectedAgentId);
    }
  }, [selectedAgentId, loadMemory, loadDailyLogs]);

  const sortedLogDates = useMemo(() => {
    return Object.keys(dailyLogs).sort((a, b) => b.localeCompare(a));
  }, [dailyLogs]);

  const selectedAgent = agents[selectedAgentId];

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex flex-col h-full overflow-hidden"
    >
      <header className="shrink-0 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Brain className="h-6 w-6 text-foreground" />
            <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight">
              Memory
            </h1>
          </div>

          {agentList.length > 0 && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <Select
                value={selectedAgentId}
                onValueChange={setSelectedAgentId}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agentList.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name || agent.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </header>

      <ScrollArea className="flex-1 min-h-0">
        {agentList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Brain className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-display text-lg font-semibold text-foreground mb-1">
              No agents available
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Agents must be loaded before viewing memory. Check your database
              connection.
            </p>
          </div>
        ) : !selectedAgentId ? (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="rounded-full bg-muted p-4 mb-4">
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-display text-lg font-semibold text-foreground mb-1">
              Select an agent
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Choose an agent from the dropdown above to view their memory files
              and daily logs.
            </p>
          </div>
        ) : (
          <div className="pr-4 space-y-6">
            {/* MEMORY.md Section */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">
                      MEMORY.md
                    </CardTitle>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {selectedAgent?.name || selectedAgentId}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Long-term curated memory. Read-only.
                </p>
              </CardHeader>
              <CardContent>
                {loadingMemory ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : memoryError ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground italic">
                      {memoryError}
                    </p>
                  </div>
                ) : memoryContent ? (
                  <pre className="font-mono text-sm text-secondary-foreground bg-muted rounded-md p-4 whitespace-pre-wrap break-words leading-relaxed max-h-[280px] overflow-auto">
                    {memoryContent}
                  </pre>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground italic">
                      No memory content yet. The agent writes to MEMORY.md
                      during sessions.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Daily Logs Section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Daily Logs
                </h2>
              </div>

              {loadingDaily ? (
                <Card>
                  <CardContent className="py-8">
                    <div className="flex items-center justify-center">
                      <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  </CardContent>
                </Card>
              ) : dailyError ? (
                <Card>
                  <CardContent className="py-8">
                    <p className="text-sm text-muted-foreground italic text-center">
                      {dailyError}
                    </p>
                  </CardContent>
                </Card>
              ) : sortedLogDates.length === 0 ? (
                <Card>
                  <CardContent className="py-8">
                    <div className="flex flex-col items-center">
                      <Calendar className="h-6 w-6 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground italic text-center">
                        No daily log entries found for this agent.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {sortedLogDates.map((date, index) => (
                    <motion.div
                      key={date}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.24,
                        delay: index * 0.04,
                        ease: [0.25, 0.46, 0.45, 0.94],
                      }}
                    >
                      <Card>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">
                              {formatDateLabel(date)}
                            </CardTitle>
                            <Badge
                              variant="outline"
                              className="font-mono text-[10px]"
                            >
                              {date}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <pre className="font-mono text-xs text-secondary-foreground bg-muted rounded-md p-3 whitespace-pre-wrap break-words leading-relaxed max-h-[240px] overflow-auto">
                            {dailyLogs[date]}
                          </pre>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </ScrollArea>
    </motion.div>
  );
}
