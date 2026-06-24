import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface ProjectRead {
  id: string;
  department_id: string;
  name: string;
  tender_no: string;
  agreement_no: string | null;
  contract_value: string;
  start_date: string;
  completion_date: string;
  site_engineer_id: string | null;
  project_manager_id: string | null;
  site_latitude: string | null;
  site_longitude: string | null;
  geofence_radius_meters: number;
  attendance_photo_required: boolean;
  attendance_gps_required: boolean;
  status: 'ACTIVE' | 'COMPLETED' | 'SUSPENDED';
}

export interface ProjectCreateInput {
  department_id: string;
  name: string;
  tender_no: string;
  agreement_no?: string;
  contract_value: string;
  start_date: string;
  completion_date: string;
  attendance_photo_required?: boolean;
  attendance_gps_required?: boolean;
}

export interface ProjectUpdateInput {
  name?: string;
  agreement_no?: string;
  contract_value?: string;
  completion_date?: string;
  status?: ProjectRead['status'];
  site_engineer_id?: string | null;
  project_manager_id?: string | null;
  attendance_photo_required?: boolean;
  attendance_gps_required?: boolean;
  site_latitude?: number | null;
  site_longitude?: number | null;
  geofence_radius_meters?: number;
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await apiClient.get<ProjectRead[]>('/projects')).data,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ProjectCreateInput) => (await apiClient.post<ProjectRead>('/projects', data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ProjectUpdateInput }) =>
      (await apiClient.patch<ProjectRead>(`/projects/${id}`, data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/projects/${id}`);
      return id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export interface ProjectSummaryRead {
  project_id: string;
  contract_value: string;
  total_billed: string;
  total_received: string;
  outstanding: string;
}

export function useProjectSummary(projectId: string | null) {
  return useQuery({
    queryKey: ['project-summary', projectId],
    queryFn: async () => (await apiClient.get<ProjectSummaryRead>(`/projects/${projectId}/summary`)).data,
    enabled: !!projectId,
  });
}
