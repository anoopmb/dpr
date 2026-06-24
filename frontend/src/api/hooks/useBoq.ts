import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface BoqItemRead {
  id: string;
  project_id: string;
  section_id: string | null;
  work_type_id: string;
  uom_id: string;
  item_no: string;
  description: string;
  tendered_qty: string;
  consumed_qty: string;
  rate: string;
  has_active_variation_order: boolean;
}

export interface BoqItemCreateInput {
  project_id: string;
  section_id?: string | null;
  work_type_id: string;
  uom_id: string;
  item_no: string;
  description: string;
  tendered_qty: string;
  rate: string;
}

export interface BoqSectionRead {
  id: string;
  project_id: string;
  section_no: string;
  section_name: string;
  sort_order: number;
  items: BoqItemRead[];
}

export interface BoqSectionCreateInput {
  project_id: string;
  section_no: string;
  section_name: string;
  sort_order?: number;
}

export interface BoqSectionUpdateInput {
  section_no?: string;
  section_name?: string;
  sort_order?: number;
}

export function useBoqItems(projectId: string | null) {
  return useQuery({
    queryKey: ['boq-items', projectId],
    queryFn: async () => (await apiClient.get<BoqItemRead[]>(`/boq-items/by-project/${projectId}`)).data,
    enabled: !!projectId,
  });
}

export function useBoqSections(projectId: string | null) {
  return useQuery({
    queryKey: ['boq-sections', projectId],
    queryFn: async () => (await apiClient.get<BoqSectionRead[]>(`/boq-sections/by-project/${projectId}`)).data,
    enabled: !!projectId,
  });
}

export function useCreateBoqItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: BoqItemCreateInput) => (await apiClient.post<BoqItemRead>('/boq-items', data)).data,
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ['boq-items', item.project_id] });
      queryClient.invalidateQueries({ queryKey: ['boq-sections', item.project_id] });
    },
  });
}

export function useCreateBoqSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: BoqSectionCreateInput) =>
      (await apiClient.post<BoqSectionRead>('/boq-sections', data)).data,
    onSuccess: (section) => queryClient.invalidateQueries({ queryKey: ['boq-sections', section.project_id] }),
  });
}

export function useUpdateBoqSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: BoqSectionUpdateInput }) =>
      (await apiClient.patch<BoqSectionRead>(`/boq-sections/${id}`, data)).data,
    onSuccess: (section) => queryClient.invalidateQueries({ queryKey: ['boq-sections', section.project_id] }),
  });
}

export function useDeleteBoqSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      await apiClient.delete(`/boq-sections/${id}`);
      return projectId;
    },
    onSuccess: (projectId) => queryClient.invalidateQueries({ queryKey: ['boq-sections', projectId] }),
  });
}

export interface BoqItemUpdateInput {
  section_id?: string | null;
  item_no?: string;
  description?: string;
  work_type_id?: string;
  uom_id?: string;
  tendered_qty?: string;
  rate?: string;
}

export function useUpdateBoqItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: BoqItemUpdateInput }) =>
      (await apiClient.patch<BoqItemRead>(`/boq-items/${id}`, data)).data,
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ['boq-items', item.project_id] });
      queryClient.invalidateQueries({ queryKey: ['boq-sections', item.project_id] });
    },
  });
}

export function useDeleteBoqItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      await apiClient.delete(`/boq-items/${id}`);
      return projectId;
    },
    onSuccess: (projectId) => {
      queryClient.invalidateQueries({ queryKey: ['boq-items', projectId] });
      queryClient.invalidateQueries({ queryKey: ['boq-sections', projectId] });
    },
  });
}
