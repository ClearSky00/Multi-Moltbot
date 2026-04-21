import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Search, Download, Trash2, ToggleLeft } from "lucide-react";
import {
  listGlobalSkills,
  enableSkill,
  disableSkill,
} from "../services/openclaw";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
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

function SkillCard({ skill, onToggle, index }) {
  const [toggling, setToggling] = useState(false);
  const isGlobal = skill.scope === "global" || !skill.agent_id;

  const handleToggle = async (checked) => {
    setToggling(true);
    try {
      await onToggle(skill.id, checked);
    } finally {
      setToggling(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.24,
        delay: index * 0.055,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      <Card className="transition-all hover:shadow-md hover:-translate-y-0.5">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm font-medium">
                {skill.name}
              </CardTitle>
              <CardDescription className="mt-1 line-clamp-2">
                {skill.description || "No description available."}
              </CardDescription>
            </div>
            <Switch
              checked={skill.enabled}
              onCheckedChange={handleToggle}
              disabled={toggling}
              aria-label={`${skill.enabled ? "Disable" : "Enable"} ${skill.name}`}
            />
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={isGlobal ? "secondary" : "outline"}>
              {isGlobal ? "Global" : "Agent"}
            </Badge>
            {skill.version && (
              <span className="font-mono text-[10px] text-muted-foreground">
                v{skill.version}
              </span>
            )}
            {skill.agent_id && (
              <Badge variant="outline" className="font-mono text-[10px]">
                {skill.agent_id}
              </Badge>
            )}
            {!skill.enabled && (
              <span className="text-[10px] text-muted-foreground italic">
                Disabled
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Skills() {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load skills from the filesystem (~/.openclaw/skills/) via IPC
      const result = await listGlobalSkills();
      if (result?.data && Array.isArray(result.data)) {
        // Default all filesystem skills to enabled (they are active if present)
        setSkills(
          result.data.map((s) => ({ ...s, enabled: s.enabled !== false })),
        );
      } else {
        setSkills([]);
      }
    } catch (err) {
      console.error("[Skills] Failed to load skills:", err);
      setError(
        "Failed to load skills. Ensure the OpenClaw skills directory exists.",
      );
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const handleToggle = useCallback(async (skillId, enabled) => {
    try {
      const handler = enabled ? enableSkill : disableSkill;
      await handler({ skillId, scope: "global" });
      setSkills((prev) =>
        prev.map((s) => (s.id === skillId ? { ...s, enabled } : s)),
      );
    } catch (err) {
      console.error("[Skills] Toggle failed:", err);
    }
  }, []);

  const filteredSkills = skills.filter((skill) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (skill.name && skill.name.toLowerCase().includes(q)) ||
      (skill.description && skill.description.toLowerCase().includes(q)) ||
      (skill.id && skill.id.toLowerCase().includes(q))
    );
  });

  const globalSkills = filteredSkills.filter(
    (s) => s.scope === "global" || !s.agent_id,
  );
  const agentSkills = filteredSkills.filter(
    (s) => s.scope !== "global" && s.agent_id,
  );

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
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-foreground" />
            <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight">
              Skills
            </h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadSkills}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground ml-9 mb-4">
          {skills.length} skill{skills.length !== 1 ? "s" : ""} installed
        </p>

        <div className="relative ml-9">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Filter skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 max-w-sm"
          />
        </div>
      </header>

      <ScrollArea className="flex-1 min-h-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">Loading skills...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Sparkles className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-display text-lg font-semibold text-foreground mb-1">
              Skills Unavailable
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              {error}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={loadSkills}
            >
              Retry
            </Button>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Sparkles className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-display text-lg font-semibold text-foreground mb-1">
              {searchQuery.trim()
                ? "No skills match your search"
                : "No skills installed"}
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              {searchQuery.trim()
                ? "Try a different search term or clear the filter."
                : "Install skills to extend your agents' capabilities. Skills can be global or assigned to specific agents."}
            </p>
          </div>
        ) : (
          <div className="pr-4 space-y-6">
            {globalSkills.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Global Skills
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {globalSkills.map((skill, index) => (
                    <SkillCard
                      key={skill.id}
                      skill={skill}
                      onToggle={handleToggle}
                      index={index}
                    />
                  ))}
                </div>
              </section>
            )}

            {agentSkills.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Agent Skills
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {agentSkills.map((skill, index) => (
                    <SkillCard
                      key={skill.id}
                      skill={skill}
                      onToggle={handleToggle}
                      index={index}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </ScrollArea>
    </motion.div>
  );
}
