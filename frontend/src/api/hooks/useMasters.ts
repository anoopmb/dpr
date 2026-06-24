import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface MasterRow {
  id: string;
  code: string;
  name: string;
}

export interface DepartmentRow extends MasterRow {
  is_active: boolean;
}

export type UomRow = MasterRow;

export interface WorkTypeRow extends MasterRow {
  dimension_fields: string[];
  formula: 'PRODUCT' | 'AREA_LH' | 'LENGTH_ONLY';
  output_uom_id: string;
  is_active: boolean;
}

export interface MaterialRow extends MasterRow {
  default_uom_id: string;
  category: string | null;
  cost_rate: string | null;
  cost_rate_unit: string | null;
  is_active: boolean;
}

export interface MachineryRow extends MasterRow {
  hire_rate: string | null;
  hire_unit: string | null;
  is_active: boolean;
}

export interface WorkerCategoryRow extends MasterRow {
  daily_rate: string | null;
}

export type ExpenseCategoryRow = MasterRow;

export interface StockLocationRow {
  id: string;
  name: string;
  location_type: 'HEAD_OFFICE' | 'SITE';
  project_id: string | null;
  is_active: boolean;
}

function useMasterList<T>(path: string) {
  return useQuery({
    queryKey: ['masters', path],
    queryFn: async () => (await apiClient.get<T[]>(`/masters/${path}`)).data,
    staleTime: 5 * 60_000,
  });
}

export function useCreateMaster<T, TInput extends object>(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: TInput) => (await apiClient.post<T>(`/masters/${path}`, data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['masters', path] }),
  });
}

export function useUpdateMaster<T, TInput extends object>(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TInput }) =>
      (await apiClient.patch<T>(`/masters/${path}/${id}`, data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['masters', path] }),
  });
}

export function useDeleteMaster(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await apiClient.delete(`/masters/${path}/${id}`); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['masters', path] }),
  });
}

export const useDepartments = () => useMasterList<DepartmentRow>('departments');
export const useUoms = () => useMasterList<UomRow>('uoms');
export const useWorkTypes = () => useMasterList<WorkTypeRow>('work-types');
export const useMaterials = () => useMasterList<MaterialRow>('materials');
export const useMachinery = () => useMasterList<MachineryRow>('machinery');
export const useWorkerCategories = () => useMasterList<WorkerCategoryRow>('worker-categories');
export const useExpenseCategories = () => useMasterList<ExpenseCategoryRow>('expense-categories');
export const useStockLocations = () => useMasterList<StockLocationRow>('stock-locations');
