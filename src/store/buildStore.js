import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import * as db from "../services/db";

const useBuildStore = create(
  subscribeWithSelector((set, get) => ({
    builds: [],
    selectedBuildId: null,
    isLoading: false,

    fetchBuilds: async () => {
      set({ isLoading: true });
      try {
        const result = await db.listBuilds();
        if (result?.error) {
          console.error("[BuildStore] fetchBuilds DB error:", result.error);
          return;
        }
        const raw = result?.data;
        const buildList = Array.isArray(raw) ? raw : [];

        const rows = buildList.map((b) => ({
          id: b.id,
          title: b.title || "",
          description: b.description || "",
          status: b.status || "pending",
          agent_id: b.agent_id || null,
          task_id: b.task_id || null,
          output: b.output || null,
          artifact_url: b.artifact_url || null,
          metadata: b.metadata || {},
          started_at: b.started_at || null,
          completed_at: b.completed_at || null,
          created_at: b.created_at || null,
        }));

        rows.sort((a, b) => {
          const aTime = new Date(a.created_at || 0).getTime();
          const bTime = new Date(b.created_at || 0).getTime();
          return bTime - aTime;
        });

        set({ builds: rows, isLoading: false });
      } catch (err) {
        console.error("[BuildStore] fetchBuilds failed:", err);
        set({ isLoading: false });
      }
    },

    addBuild: (build) => {
      set((state) => ({
        builds: [
          {
            id: build.id,
            title: build.title || "",
            description: build.description || "",
            status: build.status || "pending",
            agent_id: build.agent_id || null,
            task_id: build.task_id || null,
            output: build.output || null,
            artifact_url: build.artifact_url || null,
            metadata: build.metadata || {},
            started_at: build.started_at || null,
            completed_at: build.completed_at || null,
            created_at: build.created_at || new Date().toISOString(),
          },
          ...state.builds,
        ],
      }));
    },

    updateBuild: (buildId, updates) => {
      set((state) => ({
        builds: state.builds.map((b) =>
          b.id === buildId ? { ...b, ...updates } : b,
        ),
      }));
    },

    removeBuild: (buildId) => {
      const removed = get().builds.find((b) => b.id === buildId);
      const wasSelected = get().selectedBuildId === buildId;
      set((state) => ({
        builds: state.builds.filter((b) => b.id !== buildId),
        selectedBuildId:
          state.selectedBuildId === buildId ? null : state.selectedBuildId,
      }));
      // Returns a rollback function — call on async failure to restore the build
      return () => {
        if (removed) {
          set((state) => {
            const exists = state.builds.some((b) => b.id === removed.id);
            return {
              builds: exists ? state.builds : [removed, ...state.builds],
              selectedBuildId: wasSelected ? removed.id : state.selectedBuildId,
            };
          });
        }
      };
    },

    selectBuild: (buildId) => {
      set({ selectedBuildId: buildId });
    },

    clearSelection: () => {
      set({ selectedBuildId: null });
    },
  })),
);

export { useBuildStore };
export default useBuildStore;
