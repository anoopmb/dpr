import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface WorkerRead {
  id: string;
  project_id: string;
  worker_category_id: string;
  full_name: string;
  phone: string | null;
  photo_url: string | null;
  contractor_name: string | null;
  is_active: boolean;
}

export interface WorkerCreateInput {
  project_id: string;
  worker_category_id: string;
  full_name: string;
  phone?: string;
  photo_url?: string;
  contractor_name?: string;
  mark_present_today?: boolean;
}

export interface WorkerUpdateInput {
  full_name?: string;
  phone?: string;
  contractor_name?: string;
  worker_category_id?: string;
  is_active?: boolean;
}

export interface AttendanceRecordRead {
  id: string;
  project_id: string;
  worker_id: string;
  attendance_date: string;
  check_in_time: string;
  photo_url: string | null;
  latitude: string | null;
  longitude: string | null;
  gps_accuracy_meters: string | null;
  location_name: string | null;
  within_geofence: boolean;
  marked_by: string;
}

export interface AttendanceCheckInInput {
  worker_id: string;
  project_id: string;
  latitude?: number;
  longitude?: number;
  gps_accuracy_meters?: number;
  location_name?: string;
  photo_url?: string;
}

export interface MarkPresentInput {
  project_id: string;
  worker_ids: string[];
  latitude?: number;
  longitude?: number;
  gps_accuracy_meters?: number;
  location_name?: string;
}

export function useWorkers(projectId: string | null) {
  return useQuery({
    queryKey: ['workers', projectId],
    queryFn: async () => (await apiClient.get<WorkerRead[]>(`/workers/by-project/${projectId}`)).data,
    enabled: !!projectId,
  });
}

export function useCreateWorker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: WorkerCreateInput) => (await apiClient.post<WorkerRead>('/workers', data)).data,
    onSuccess: (worker) => {
      queryClient.invalidateQueries({ queryKey: ['workers', worker.project_id] });
      queryClient.invalidateQueries({ queryKey: ['attendance', worker.project_id] });
    },
  });
}

export function useAttendanceRecords(projectId: string | null, date?: string) {
  return useQuery({
    queryKey: ['attendance', projectId, date],
    queryFn: async () =>
      (
        await apiClient.get<AttendanceRecordRead[]>(`/attendance/by-project/${projectId}`, {
          params: date ? { attendance_date: date } : undefined,
        })
      ).data,
    enabled: !!projectId,
  });
}

export function useCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: AttendanceCheckInInput) =>
      (await apiClient.post<AttendanceRecordRead>('/attendance/check-in', data)).data,
    onSuccess: (record) => queryClient.invalidateQueries({ queryKey: ['attendance', record.project_id] }),
  });
}

export function useMarkPresent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: MarkPresentInput) =>
      (await apiClient.post<AttendanceRecordRead[]>('/attendance/mark-present', data)).data,
    onSuccess: (_records, variables) =>
      queryClient.invalidateQueries({ queryKey: ['attendance', variables.project_id] }),
  });
}

export function useUpdateWorker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: WorkerUpdateInput }) =>
      (await apiClient.patch<WorkerRead>(`/workers/${id}`, data)).data,
    onSuccess: (worker) => queryClient.invalidateQueries({ queryKey: ['workers', worker.project_id] }),
  });
}
