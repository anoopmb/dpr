import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { UserRole } from '@/store/auth-store';

export type WorkflowEntityType = 'MEASUREMENT' | 'DPR_HEADER';

export interface WorkflowStageRead {
  id: string;
  sequence_order: number;
  status_code: string;
  label: string;
  allowed_roles: UserRole[];
  allow_reject: boolean;
  feeds_production: boolean;
  is_final_approval: boolean;
}

export interface WorkflowStageInput {
  status_code: string;
  label: string;
  allowed_roles: UserRole[];
  allow_reject: boolean;
  feeds_production: boolean;
  is_final_approval: boolean;
}

export interface WorkflowDefinitionRead {
  id: string;
  entity_type: WorkflowEntityType;
  project_id: string | null;
  name: string;
  approvals_enabled: boolean;
  lock_allowed_roles: UserRole[] | null;
  is_active: boolean;
  is_org_default: boolean;
  levels: WorkflowStageRead[];
}

export interface WorkflowDefinitionCreateInput {
  entity_type: WorkflowEntityType;
  project_id?: string | null;
  name: string;
  approvals_enabled?: boolean;
  lock_allowed_roles?: UserRole[] | null;
  levels: WorkflowStageInput[];
}

export interface WorkflowDefinitionUpdateInput {
  name?: string;
  approvals_enabled?: boolean;
  lock_allowed_roles?: UserRole[] | null;
  levels?: WorkflowStageInput[];
}

const ALL_KEY = ['workflow-definitions-all'];
const EFFECTIVE_KEY = ['workflow-definition-effective'];

/** The workflow actually governing a record right now — project override if
 * one exists and is active, else the org-wide default. Used by approval-
 * action pages (MeasurementsPage, DprHistoryPage, DprTodayPage) to render
 * stage labels and gate action buttons by the current user's role. */
export function useEffectiveWorkflow(entityType: WorkflowEntityType, projectId: string | null) {
  return useQuery({
    queryKey: [...EFFECTIVE_KEY, entityType, projectId],
    queryFn: async () =>
      (
        await apiClient.get<WorkflowDefinitionRead>('/workflow-definitions', {
          params: { entity_type: entityType, project_id: projectId ?? undefined },
        })
      ).data,
  });
}

/** Every definition for this entity type — the org default plus any project
 * overrides. ADMIN-only; backs the Approval Workflow settings page. */
export function useWorkflowDefinitions(entityType: WorkflowEntityType) {
  return useQuery({
    queryKey: [...ALL_KEY, entityType],
    queryFn: async () =>
      (await apiClient.get<WorkflowDefinitionRead[]>('/workflow-definitions/all', { params: { entity_type: entityType } })).data,
  });
}

export function useCreateWorkflowDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: WorkflowDefinitionCreateInput) =>
      (await apiClient.post<WorkflowDefinitionRead>('/workflow-definitions', data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ALL_KEY });
      queryClient.invalidateQueries({ queryKey: EFFECTIVE_KEY });
    },
  });
}

export function useUpdateWorkflowDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: WorkflowDefinitionUpdateInput }) =>
      (await apiClient.patch<WorkflowDefinitionRead>(`/workflow-definitions/${id}`, data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ALL_KEY });
      queryClient.invalidateQueries({ queryKey: EFFECTIVE_KEY });
    },
  });
}

export function useDeleteWorkflowDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/workflow-definitions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ALL_KEY });
      queryClient.invalidateQueries({ queryKey: EFFECTIVE_KEY });
    },
  });
}
