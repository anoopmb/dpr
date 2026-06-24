import { useEffect } from 'react';
import { useCreateDprHeader, useDprList } from '@/api/hooks/useDpr';
import { useProjectContextStore } from '@/store/project-context-store';

/**
 * Resolves (and transparently creates if missing) the DPR header for a
 * project on the shared selectedEntryDate (set via DPR-Today's date
 * picker), so field screens that attach entries to a header — Materials
 * Used, Machinery Used — don't require a manual detour through DPR-Today
 * first when the user picks a project directly on their own screen.
 */
export function useTodayDprHeader(projectId: string | null) {
  const { data: dprList, isLoading } = useDprList(projectId);
  const createHeader = useCreateDprHeader();
  const setCurrentDprHeaderId = useProjectContextStore((s) => s.setCurrentDprHeaderId);
  const selectedEntryDate = useProjectContextStore((s) => s.selectedEntryDate);

  const entryHeader = dprList?.find((d) => d.report_date === selectedEntryDate) ?? null;

  useEffect(() => {
    if (entryHeader) setCurrentDprHeaderId(entryHeader.id);
  }, [entryHeader, setCurrentDprHeaderId]);

  const ensureHeader = async (): Promise<string> => {
    if (entryHeader) return entryHeader.id;
    if (!projectId) throw new Error('No project selected');
    const header = await createHeader.mutateAsync({ project_id: projectId, report_date: selectedEntryDate });
    setCurrentDprHeaderId(header.id);
    return header.id;
  };

  return {
    headerId: entryHeader?.id ?? null,
    isLoading,
    ensureHeader,
    creating: createHeader.isPending,
  };
}
