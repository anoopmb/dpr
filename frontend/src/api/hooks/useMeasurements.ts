import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

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

export function useCreateMeasurement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: MeasurementCreateInput) =>
      (await apiClient.post<MeasurementRead>('/measurements', data)).data,
    onSuccess: (measurement) => {
      queryClient.invalidateQueries({ queryKey: ['measurements', measurement.project_id] });
      queryClient.invalidateQueries({ queryKey: ['dpr-production'] });
      queryClient.invalidateQueries({ queryKey: ['dpr'] });
    },
  });
}

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
