import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProjectContextState {
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  currentDprHeaderId: string | null;
  setCurrentDprHeaderId: (id: string | null) => void;
}

// Holds which project the current user is working against — desktop pages
// and field screens both filter by this. Persisted so a field supervisor
// doesn't have to re-pick their site every time they open a sub-screen.
// currentDprHeaderId tracks today's open DPR so Materials/Machinery/etc.
// field screens know which header to attach their entries to.
export const useProjectContextStore = create<ProjectContextState>()(
  persist(
    (set) => ({
      selectedProjectId: null,
      setSelectedProjectId: (id) => set({ selectedProjectId: id }),
      currentDprHeaderId: null,
      setCurrentDprHeaderId: (id) => set({ currentDprHeaderId: id }),
    }),
    { name: 'dpr-project-context' },
  ),
);
