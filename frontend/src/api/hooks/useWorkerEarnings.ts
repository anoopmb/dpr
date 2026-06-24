import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface WorkerEarningsRow {
  worker_id: string;
  worker_name: string;
  category_id: string;
  category_name: string;
  days_present: number;
  daily_rate: string | null;
  total_earnings: string | null;
}

export interface WorkerEarningsReportRead {
  project_id: string;
  from_date: string;
  to_date: string;
  rows: WorkerEarningsRow[];
  total_days_present: number;
  total_earnings: string;
}

export function useWorkerEarningsReport(
  projectId: string | null,
  fromDate: string,
  toDate: string,
  workerCategoryId?: string,
) {
  return useQuery({
    queryKey: ['worker-earnings', projectId, fromDate, toDate, workerCategoryId],
    queryFn: async () => {
      const params = new URLSearchParams({ project_id: projectId ?? '', from_date: fromDate, to_date: toDate });
      if (workerCategoryId) params.set('worker_category_id', workerCategoryId);
      return (await apiClient.get<WorkerEarningsReportRead>(`/reports/worker-earnings?${params.toString()}`)).data;
    },
    enabled: !!projectId && !!fromDate && !!toDate,
  });
}

export interface DailyLabourLogRow {
  attendance_date: string;
  worker_id: string;
  worker_name: string;
  category_id: string;
  category_name: string;
  daily_rate: string | null;
  cost: string | null;
}

export interface DailyLabourLogReportRead {
  project_id: string;
  from_date: string;
  to_date: string;
  rows: DailyLabourLogRow[];
  total_cost: string;
}

export function useDailyLabourLog(
  projectId: string | null,
  fromDate: string,
  toDate: string,
  workerCategoryId?: string,
) {
  return useQuery({
    queryKey: ['daily-labour-log', projectId, fromDate, toDate, workerCategoryId],
    queryFn: async () => {
      const params = new URLSearchParams({ project_id: projectId ?? '', from_date: fromDate, to_date: toDate });
      if (workerCategoryId) params.set('worker_category_id', workerCategoryId);
      return (await apiClient.get<DailyLabourLogReportRead>(`/reports/daily-labour-log?${params.toString()}`)).data;
    },
    enabled: !!projectId && !!fromDate && !!toDate,
  });
}
