import { useEffect } from 'react';
import dayjs from 'dayjs';
import { useCreateDprHeader, useDprList } from '@/api/hooks/useDpr';
import { useProjectContextStore } from '@/store/project-context-store';

/**
 * Resolves (and transparently creates if missing) today's DPR header for a
 * project, so field screens that attach entries to a header — Materials
 * Used, Machinery Used — don't require a manual detour through DPR-Today
 * first when the user picks a project directly on their own screen.
 */
export function useTodayDprHeader(projectId: string | null) {
  const { data: dprList, isLoading } = useDprList(projectId);
  const createHeader = useCreateDprHeader();
  const setCurrentDprHeaderId = useProjectContextStore((s) => s.setCurrentDprHeaderId);

  const today = dayjs().format('YYYY-MM-DD');
  const todayHeader = dprList?.find((d) => d.report_date === today) ?? null;

  useEffect(() => {
    if (todayHeader) setCurrentDprHeaderId(todayHeader.id);
  }, [todayHeader, setCurrentDprHeaderId]);

  const ensureHeader = async (): Promise<string> => {
    if (todayHeader) return todayHeader.id;
    if (!projectId) throw new Error('No project selected');
    const header = await createHeader.mutateAsync({ project_id: projectId, report_date: today });
    setCurrentDprHeaderId(header.id);
    return header.id;
  };

  return {
    headerId: todayHeader?.id ?? null,
    isLoading,
    ensureHeader,
    creating: createHeader.isPending,
  };
}
