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
  construction_subtype: string | null;
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
  construction_subtype?: string | null;
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
        construction_subtype?: string | null;
        steel_lines?: SteelLineInput[];
      };
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

export function useMaterialTemplatePreview(params: {
  construction_type: string;
  qty: number;
  construction_subtype?: string | null;
} | null) {
  return useQuery({
    queryKey: ['material-preview', params],
    queryFn: async () =>
      (await apiClient.get<AutoMaterialRead[]>('/material-templates/preview', { params: {
        construction_type: params!.construction_type,
        qty: params!.qty,
        ...(params!.construction_subtype ? { construction_subtype: params!.construction_subtype } : {}),
      }})).data,
    enabled: !!params && params.qty > 0 && params.construction_type !== 'GENERAL' && params.construction_type !== 'STEEL',
  });
}
