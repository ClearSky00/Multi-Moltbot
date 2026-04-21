import { useEffect, useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardList, Search, X } from 'lucide-react';
import useTaskStore from '../store/taskStore';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import TaskCard from '../components/tasks/TaskCard';
import TaskCardSkeleton from '../components/tasks/TaskCardSkeleton';

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const pageTransition = {
  duration: 0.42,
  ease: [0.25, 0.46, 0.45, 0.94],
};

const ACTIVE_STATUSES = new Set(['pending', 'running', 'awaiting_input', 'quota_exhausted']);
const COMPLETED_STATUSES = new Set(['completed']);
const FAILED_STATUSES = new Set(['failed', 'cancelled']);

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timerRef.current);
  }, [value, delay]);
  return debounced;
}

function EmptyTab({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="rounded-full bg-muted p-4 mb-4">
        <ClipboardList className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground text-center max-w-xs">{message}</p>
    </div>
  );
}

function TaskList({ tasks, isLoading, emptyMessage }) {
  if (isLoading) {
    return (
      <div className="pr-4">
        {[0, 1, 2].map((i) => (
          <TaskCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return <EmptyTab message={emptyMessage} />;
  }

  return (
    <div className="pr-4">
      <AnimatePresence mode="popLayout">
        {tasks.map((task, index) => (
          <TaskCard key={task.id} task={task} index={index} />
        ))}
      </AnimatePresence>
    </div>
  );
}

export default function Tasks() {
  const tasks = useTaskStore((s) => s.tasks);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    fetchTasks().finally(() => setIsLoading(false));
  }, [fetchTasks]);

  // Poll when active tasks exist
  const hasActive = useMemo(
    () => tasks.some((t) => t.status === 'running' || t.status === 'pending'),
    [tasks]
  );

  useEffect(() => {
    if (!hasActive) return undefined;
    const id = setInterval(() => {
      void useTaskStore.getState().fetchTasks();
    }, 4000);
    return () => clearInterval(id);
  }, [hasActive]);

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aTime = new Date(a.createdAt || a.created_at || 0).getTime();
      const bTime = new Date(b.createdAt || b.created_at || 0).getTime();
      return bTime - aTime;
    });
  }, [tasks]);

  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return sorted;
    const q = debouncedSearch.toLowerCase();
    return sorted.filter((t) => t.goal?.toLowerCase().includes(q));
  }, [sorted, debouncedSearch]);

  const activeTasks = useMemo(
    () => filtered.filter((t) => ACTIVE_STATUSES.has(t.status)),
    [filtered]
  );
  const completedTasks = useMemo(
    () => filtered.filter((t) => COMPLETED_STATUSES.has(t.status)),
    [filtered]
  );
  const failedTasks = useMemo(
    () => filtered.filter((t) => FAILED_STATUSES.has(t.status)),
    [filtered]
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
      <header className="shrink-0 mb-4">
        <div className="flex items-center gap-3 mb-1">
          <ClipboardList className="h-6 w-6 text-foreground" />
          <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight">
            Tasks
          </h1>
        </div>

        {/* Search bar */}
        <div className="relative mt-3 ml-9">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className={cn(
              'w-full max-w-sm pl-8 pr-8 py-1.5 text-sm rounded-md',
              'bg-[var(--color-input-bg)] border border-[var(--color-input-border)]',
              'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-disabled)]',
              'focus:outline-none focus:border-[var(--color-input-border-focus)]',
              'font-[family-name:var(--font-body)] transition-colors'
            )}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>

      <Tabs defaultValue="active" className="flex flex-col flex-1 overflow-hidden">
        <TabsList className="shrink-0 ml-9 justify-start bg-transparent border-b border-[var(--color-border-light)] rounded-none h-auto p-0 gap-0 mb-0">
          <TabsTrigger
            value="active"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--color-border-accent)] data-[state=active]:bg-transparent px-4 py-2 text-sm font-[family-name:var(--font-body)]"
          >
            Active
            {activeTasks.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-[var(--color-border-accent)] text-white text-[10px] font-bold">
                {activeTasks.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="completed"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--color-border-accent)] data-[state=active]:bg-transparent px-4 py-2 text-sm font-[family-name:var(--font-body)]"
          >
            Completed
            {completedTasks.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">
                {completedTasks.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="failed"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--color-border-accent)] data-[state=active]:bg-transparent px-4 py-2 text-sm font-[family-name:var(--font-body)]"
          >
            Failed
            {failedTasks.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                {failedTasks.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-hidden mt-4">
          <TabsContent value="active" className="h-full mt-0">
            <ScrollArea className="h-full">
              <TaskList
                tasks={activeTasks}
                isLoading={isLoading}
                emptyMessage={
                  search
                    ? 'No active tasks match your search.'
                    : 'No active tasks. Submit a goal from the Dashboard to get started.'
                }
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="completed" className="h-full mt-0">
            <ScrollArea className="h-full">
              <TaskList
                tasks={completedTasks}
                isLoading={isLoading}
                emptyMessage={
                  search
                    ? 'No completed tasks match your search.'
                    : 'No completed tasks yet.'
                }
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="failed" className="h-full mt-0">
            <ScrollArea className="h-full">
              <TaskList
                tasks={failedTasks}
                isLoading={isLoading}
                emptyMessage={
                  search
                    ? 'No failed tasks match your search.'
                    : 'No failed or cancelled tasks.'
                }
              />
            </ScrollArea>
          </TabsContent>
        </div>
      </Tabs>
    </motion.div>
  );
}
