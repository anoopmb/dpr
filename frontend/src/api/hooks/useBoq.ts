import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export type BoqConstructionType = 'GENERAL' | 'CONCRETE' | 'STEEL' | 'PRIME_COAT' | 'TACK_COAT' | 'BM' | 'DBM' | 'BC';

export const CONSTRUCTION_TYPE_LABELS: Record<BoqConstructionType, string> = {
  GENERAL: 'General',
  CONCRETE: 'Concrete',
  STEEL: 'Steel / Reinforcement',
  PRIME_COAT: 'Prime Coat',
  TACK_COAT: 'Tack Coat',
  BM: 'Bituminous Macadam (BM)',
  DBM: 'Dense Bituminous Macadam (DBM)',
  BC: 'Bituminous Concrete (BC)',
};

export const CONSTRUCTION_TYPE_COLORS: Record<BoqConstructionType, string> = {
  GENERAL: 'default',
  CONCRETE: 'blue',
  STEEL: 'volcano',
  PRIME_COAT: 'green',
  TACK_COAT: 'lime',
  BM: 'orange',
  DBM: 'gold',
  BC: 'cyan',
};

export interface BoqConstructionTemplateRead {
  id: string;
  construction_type: string;
  material_id: string;
  material_name: string;
  material_code: string;
  coefficient: string;
  coefficient_description: string | null;
  uom_id: string;
  uom_code: string;
  is_active: boolean;
}

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
  current_rate: string;
  current_tendered_qty: string;
  revision_count: number;
  has_active_variation_order: boolean;
  construction_type: BoqConstructionType;
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
  construction_type?: BoqConstructionType;
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

export type BoqRevisionType = 'VARIATION_ORDER' | 'RATE_AMENDMENT' | 'RECAST_ESTIMATE' | 'QTY_REVISION';
export type BoqRevisionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface BoqRevisionRead {
  id: string;
  boq_item_id: string;
  revision_number: string;
  revision_type: BoqRevisionType;
  status: BoqRevisionStatus;
  effective_from: string;
  revised_rate: string | null;
  revised_tendered_qty: string | null;
  reason: string;
  created_by_user_id: string;
  approved_by_user_id: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  created_at: string;
}

export interface BoqRevisionCreateInput {
  revision_type: BoqRevisionType;
  effective_from: string;
  revised_rate?: string | null;
  revised_tendered_qty?: string | null;
  reason: string;
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
  construction_type?: BoqConstructionType;
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

export function useBoqRevisions(boqItemId: string | null) {
  return useQuery({
    queryKey: ['boq-revisions', boqItemId],
    queryFn: async () =>
      (await apiClient.get<BoqRevisionRead[]>(`/boq-items/${boqItemId}/revisions`)).data,
    enabled: !!boqItemId,
  });
}

export function useCreateBoqRevision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ boqItemId, data }: { boqItemId: string; data: BoqRevisionCreateInput }) =>
      (await apiClient.post<BoqRevisionRead>(`/boq-items/${boqItemId}/revisions`, data)).data,
    onSuccess: (revision) => {
      queryClient.invalidateQueries({ queryKey: ['boq-revisions', revision.boq_item_id] });
      queryClient.invalidateQueries({ queryKey: ['boq-items'] });
      queryClient.invalidateQueries({ queryKey: ['boq-sections'] });
      queryClient.invalidateQueries({ queryKey: ['boq-revisions-pending'] });
    },
  });
}

export function useApproveBoqRevision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (revisionId: string) =>
      (await apiClient.post<BoqRevisionRead>(`/boq-revisions/${revisionId}/approve`)).data,
    onSuccess: (revision) => {
      queryClient.invalidateQueries({ queryKey: ['boq-revisions', revision.boq_item_id] });
      queryClient.invalidateQueries({ queryKey: ['boq-items'] });
      queryClient.invalidateQueries({ queryKey: ['boq-sections'] });
      queryClient.invalidateQueries({ queryKey: ['boq-revisions-pending'] });
    },
  });
}

export function useRejectBoqRevision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ revisionId, rejected_reason }: { revisionId: string; rejected_reason: string }) =>
      (await apiClient.post<BoqRevisionRead>(`/boq-revisions/${revisionId}/reject`, { rejected_reason })).data,
    onSuccess: (revision) => {
      queryClient.invalidateQueries({ queryKey: ['boq-revisions', revision.boq_item_id] });
      queryClient.invalidateQueries({ queryKey: ['boq-revisions-pending'] });
    },
  });
}

export function usePendingBoqRevisions(projectId: string | null) {
  return useQuery({
    queryKey: ['boq-revisions-pending', projectId],
    queryFn: async () =>
      (await apiClient.get<BoqRevisionRead[]>('/boq/revisions/pending', { params: { project_id: projectId } })).data,
    enabled: !!projectId,
  });
}

export function useConstructionTemplates(constructionType?: string) {
  return useQuery({
    queryKey: ['construction-templates', constructionType ?? 'all'],
    queryFn: async () =>
      (await apiClient.get<BoqConstructionTemplateRead[]>('/construction-templates', {
        params: constructionType ? { construction_type: constructionType } : {},
      })).data,
  });
}

export function useCreateConstructionTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      construction_type: string;
      material_id: string;
      coefficient: string;
      coefficient_description?: string | null;
      uom_id: string;
    }) => (await apiClient.post<BoqConstructionTemplateRead>('/construction-templates', data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['construction-templates'] }),
  });
}

export function useUpdateConstructionTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: {
      id: string;
      data: { coefficient?: string; coefficient_description?: string | null; is_active?: boolean };
    }) => (await apiClient.patch<BoqConstructionTemplateRead>(`/construction-templates/${id}`, data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['construction-templates'] }),
  });
}

export function useDeleteConstructionTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await apiClient.delete(`/construction-templates/${id}`); return id; },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['construction-templates'] }),
  });
}
