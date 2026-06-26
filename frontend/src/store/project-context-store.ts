import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import dayjs from 'dayjs';

interface ProjectContextState {
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  currentDprHeaderId: string | null;
  setCurrentDprHeaderId: (id: string | null) => void;
  selectedEntryDate: string;
  setSelectedEntryDate: (date: string) => void;
}

// Holds which project the current user is working against — desktop pages
// and field screens both filter by this. Persisted so a field supervisor
// doesn't have to re-pick their site every time they open a sub-screen.
// currentDprHeaderId tracks today's open DPR so Materials/Machinery/etc.
// field screens know which header to attach their entries to.
// selectedEntryDate is the single shared "which day am I entering data
// for" control — set only via DPR-Today's date picker; Measurements/
// Materials/Machinery read it instead of each having their own picker.
export const useProjectContextStore = create<ProjectContextState>()(
  persist(
    (set) => ({
      selectedProjectId: null,
      setSelectedProjectId: (id) => set({ selectedProjectId: id }),
      currentDprHeaderId: null,
      setCurrentDprHeaderId: (id) => set({ currentDprHeaderId: id }),
      selectedEntryDate: dayjs().format('YYYY-MM-DD'),
      setSelectedEntryDate: (date) => set({ selectedEntryDate: date }),
    }),
    {
      name: 'dpr-project-context',
      partialize: (state) => ({
        selectedProjectId: state.selectedProjectId,
        currentDprHeaderId: state.currentDprHeaderId,
      }),
    },
  ),
);
