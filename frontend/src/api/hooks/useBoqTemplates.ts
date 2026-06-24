import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface BoqTemplateItemRead {
  id: string;
  section_no: string | null;
  section_name: string | null;
  item_no: string;
  description: string;
  work_type_id: string;
  uom_id: string;
  tendered_qty: string;
  rate: string;
}

export interface BoqTemplateSummary {
  id: string;
  name: string;
  description: string | null;
  item_count: number;
}

export interface BoqTemplateRead {
  id: string;
  name: string;
  description: string | null;
  items: BoqTemplateItemRead[];
}

export interface BoqTemplateSaveFromProjectInput {
  name: string;
  description?: string | null;
}

export interface BoqBulkImportItemInput {
  section_no: string | null;
  section_name: string | null;
  item_no: string;
  description: string;
  work_type_id: string;
  uom_id: string;
  tendered_qty: string;
  rate: string;
}

export interface BoqBulkImportResult {
  added_sections: number;
  added_items: number;
  skipped_items: number;
}

export function useBoqTemplateList() {
  return useQuery({
    queryKey: ['boq-templates'],
    queryFn: async () => (await apiClient.get<BoqTemplateSummary[]>('/boq-templates')).data,
  });
}

export function useBoqTemplate(id: string | null) {
  return useQuery({
    queryKey: ['boq-templates', id],
    queryFn: async () => (await apiClient.get<BoqTemplateRead>(`/boq-templates/${id}`)).data,
    enabled: !!id,
  });
}

export function useSaveBoqTemplateFromProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, data }: { projectId: string; data: BoqTemplateSaveFromProjectInput }) =>
      (await apiClient.post<BoqTemplateRead>(`/boq-templates/from-project/${projectId}`, data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boq-templates'] }),
  });
}

export function useApplyBoqTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateId, projectId }: { templateId: string; projectId: string }) =>
      (await apiClient.post<BoqBulkImportResult>(`/boq-templates/${templateId}/apply/${projectId}`)).data,
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['boq-sections', projectId] });
      queryClient.invalidateQueries({ queryKey: ['boq-items', projectId] });
    },
  });
}

export function useDeleteBoqTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await apiClient.delete(`/boq-templates/${id}`); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boq-templates'] }),
  });
}

export function useBoqImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, items }: { projectId: string; items: BoqBulkImportItemInput[] }) =>
      (await apiClient.post<BoqBulkImportResult>(`/boq/import/${projectId}`, { items })).data,
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['boq-sections', projectId] });
      queryClient.invalidateQueries({ queryKey: ['boq-items', projectId] });
    },
  });
}
