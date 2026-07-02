import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export type MeasurementStatus = string;

export interface SteelLineInput {
  description?: string | null;
  diameter_mm: number;
  bar_count: number;
  length_m: number;
}

export interface SteelLineRead {
  id: string;
  description: string | null;
  diameter_mm: number;
  bar_count: string;
  length_m: string;
  coefficient: string;
  computed_weight_mt: string;
}

export interface AutoMaterialRead {
  material_id: string;
  material_code: string;
  material_name: string;
  computed_qty: string;
  uom_code: string;
  rate: string | null;
  manually_edited: boolean;
}

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
  boq_template_id: string | null;
  boq_template_name: string | null;
  notes: string | null;
  steel_lines: SteelLineRead[];
  auto_materials: AutoMaterialRead[];
}

export interface MeasurementCreateInput {
  project_id: string;
  boq_item_id: string;
  measurement_date: string;
  dimensions?: Record<string, string>;
  chainage?: string | null;
  rate?: string | null;
  boq_template_id?: string | null;
  steel_lines?: SteelLineInput[];
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
      queryClient.invalidateQueries({ queryKey: ['dpr-header'] });
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
      data: {
        dimensions?: Record<string, string>;
        chainage?: string | null;
        rate?: string | null;
        boq_template_id?: string | null;
        steel_lines?: SteelLineInput[];
      };
    }) => (await apiClient.patch<MeasurementRead>(`/measurements/${id}`, data)).data,
    onSuccess: (measurement) => {
      queryClient.invalidateQueries({ queryKey: ['measurements', measurement.project_id] });
      queryClient.invalidateQueries({ queryKey: ['dpr-production'] });
      queryClient.invalidateQueries({ queryKey: ['dpr'] });
      queryClient.invalidateQueries({ queryKey: ['dpr-header'] });
    },
  });
}

export function useUpdateMeasurementNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string | null }) =>
      (await apiClient.patch<MeasurementRead>(`/measurements/${id}/notes`, { notes })).data,
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
      queryClient.invalidateQueries({ queryKey: ['dpr-header'] });
    },
  });
}

export function useMaterialTemplatePreview(params: {
  template_id: string;
  qty: number;
} | null) {
  return useQuery({
    queryKey: ['material-preview', params],
    queryFn: async () =>
      (await apiClient.get<AutoMaterialRead[]>('/material-templates/preview', {
        params: { template_id: params!.template_id, qty: params!.qty },
      })).data,
    enabled: !!params && !!params.template_id && params.qty > 0,
  });
}
