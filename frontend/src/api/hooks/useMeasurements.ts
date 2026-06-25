import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

// DRAFT/SUBMITTED/REJECTED/LOCKED are the fixed bookends; everything else is
// an admin-configured approval-level status_code (see useWorkflowConfig) —
// not a closed set, so this is a plain string, not a union.
export type MeasurementStatus = string;

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
  recorded_by_name: string;
  version: number;
  superseded_by_id: string | null;
  billed: boolean;
  chainage: string | null;
  rate: string | null;
}

export interface MeasurementApprovalRead {
  id: string;
  measurement_id: string;
  from_status: string;
  to_status: string;
  acted_by: string;
  actor_name: string;
  remarks: string | null;
  acted_at: string;
}

export interface MeasurementCreateInput {
  project_id: string;
  boq_item_id: string;
  measurement_date: string;
  dimensions: Record<string, string>;
  chainage?: string | null;
  rate?: string | null;
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
      // submit/approve/reject can change which day's DPR production qty the
      // measurement sync lands in (e.g. rejecting removes it from the sum).
      queryClient.invalidateQueries({ queryKey: ['dpr-production'] });
      queryClient.invalidateQueries({ queryKey: ['dpr'] });
    },
  });
}

export function useCreateMeasurement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: MeasurementCreateInput) =>
      (await apiClient.post<MeasurementRead>('/measurements', data)).data,
    onSuccess: (measurement) => {
      queryClient.invalidateQueries({ queryKey: ['measurements', measurement.project_id] });
      // The backend auto-syncs (and may auto-create) today's DPR production
      // entry for this BOQ item — refresh both so DPR-Today reflects it live.
      queryClient.invalidateQueries({ queryKey: ['dpr-production'] });
      queryClient.invalidateQueries({ queryKey: ['dpr'] });
    },
  });
}

export function useMeasurementApprovals(measurementId: string | null) {
  return useQuery({
    queryKey: ['measurement-approvals', measurementId],
    queryFn: async () =>
      (await apiClient.get<MeasurementApprovalRead[]>(`/measurements/${measurementId}/approvals`)).data,
    enabled: !!measurementId,
  });
}

export const useSubmitMeasurement = () => useMeasurementAction('submit');
export const useApproveMeasurement = () => useMeasurementAction('approve');
export const useRejectMeasurement = () => useMeasurementAction('reject');
export const useLockMeasurement = () => useMeasurementAction('lock');

export function useUpdateMeasurement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { dimensions: Record<string, string>; chainage?: string | null; rate?: string | null };
    }) => (await apiClient.patch<MeasurementRead>(`/measurements/${id}`, data)).data,
    onSuccess: (measurement) => {
      queryClient.invalidateQueries({ queryKey: ['measurements', measurement.project_id] });
      queryClient.invalidateQueries({ queryKey: ['dpr-production'] });
      queryClient.invalidateQueries({ queryKey: ['dpr'] });
    },
  });
}

export function useRecallMeasurement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) =>
      (await apiClient.post<MeasurementRead>(`/measurements/${id}/recall`)).data,
    onSuccess: (measurement) => {
      queryClient.invalidateQueries({ queryKey: ['measurements', measurement.project_id] });
    },
  });
}

export function useDeleteMeasurement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      await apiClient.delete(`/measurements/${id}`);
      return projectId;
    },
    onSuccess: (projectId) => {
      queryClient.invalidateQueries({ queryKey: ['measurements', projectId] });
      queryClient.invalidateQueries({ queryKey: ['dpr-production'] });
      queryClient.invalidateQueries({ queryKey: ['dpr'] });
    },
  });
}
