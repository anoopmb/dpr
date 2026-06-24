import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export type MeasurementStatus = 'DRAFT' | 'SUBMITTED' | 'PM_APPROVED' | 'QS_APPROVED' | 'LOCKED' | 'REJECTED';

export interface MeasurementRead {
  id: string;
  project_id: string;
  boq_item_id: string;
  work_type_id: string;
  measurement_date: string;
  dimensions: Record<string, string>;
  computed_qty: string;
  status: MeasurementStatus;
  recorded_by: string;
  version: number;
  superseded_by_id: string | null;
  billed: boolean;
  chainage: string | null;
}

export interface MeasurementCreateInput {
  project_id: string;
  boq_item_id: string;
  measurement_date: string;
  dimensions: Record<string, string>;
  chainage?: string | null;
}

export function useMeasurements(projectId: string | null) {
  return useQuery({
    queryKey: ['measurements', projectId],
    queryFn: async () => (await apiClient.get<MeasurementRead[]>(`/measurements/by-project/${projectId}`)).data,
    enabled: !!projectId,
  });
}

function useMeasurementAction(action: 'submit' | 'approve' | 'reject' | 'lock') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, remarks }: { id: string; remarks?: string }) =>
      (
        await apiClient.post<MeasurementRead>(
          `/measurements/${id}/${action}`,
          action === 'submit' ? undefined : { remarks },
        )
      ).data,
    onSuccess: (measurement) => {
      queryClient.invalidateQueries({ queryKey: ['measurements', measurement.project_id] });
      queryClient.invalidateQueries({ queryKey: ['boq-items', measurement.project_id] });
    },
  });
}

export function useCreateMeasurement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: MeasurementCreateInput) =>
      (await apiClient.post<MeasurementRead>('/measurements', data)).data,
    onSuccess: (measurement) => queryClient.invalidateQueries({ queryKey: ['measurements', measurement.project_id] }),
  });
}

export const useSubmitMeasurement = () => useMeasurementAction('submit');
export const useApproveMeasurement = () => useMeasurementAction('approve');
export const useRejectMeasurement = () => useMeasurementAction('reject');
export const useLockMeasurement = () => useMeasurementAction('lock');
