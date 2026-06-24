import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { UserRole } from '@/store/auth-store';

export interface ProjectAssignmentRead {
  id: string;
  project_id: string;
  user_id: string;
  role: UserRole;
}

export function useProjectAssignments(projectId: string | null) {
  return useQuery({
    queryKey: ['project-assignments', projectId],
    queryFn: async () => (await apiClient.get<ProjectAssignmentRead[]>(`/projects/${projectId}/assignments`)).data,
    enabled: !!projectId,
  });
}

export function useCreateProjectAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, user_id, role }: { projectId: string; user_id: string; role: UserRole }) =>
      (await apiClient.post<ProjectAssignmentRead>(`/projects/${projectId}/assignments`, { user_id, role })).data,
    onSuccess: (_, { projectId }) =>
      queryClient.invalidateQueries({ queryKey: ['project-assignments', projectId] }),
  });
}

export function useDeleteProjectAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, assignmentId }: { projectId: string; assignmentId: string }) =>
      apiClient.delete(`/projects/${projectId}/assignments/${assignmentId}`),
    onSuccess: (_, { projectId }) =>
      queryClient.invalidateQueries({ queryKey: ['project-assignments', projectId] }),
  });
}
