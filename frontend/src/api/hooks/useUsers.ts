import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { UserRole } from '@/store/auth-store';

export interface UserRead {
  id: string;
  login_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  photo_url: string | null;
  role: UserRole;
  is_active: boolean;
}

export interface UserCreateInput {
  login_id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  password: string;
  role: UserRole;
  is_active?: boolean;
}

export interface UserUpdateInput {
  full_name?: string;
  email?: string;
  phone?: string | null;
  role?: UserRole;
  is_active?: boolean;
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => (await apiClient.get<UserRead[]>('/users')).data,
    staleTime: 60_000,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UserCreateInput) => (await apiClient.post<UserRead>('/users', data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UserUpdateInput }) =>
      (await apiClient.patch<UserRead>(`/users/${id}`, data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export interface UserProfileUpdateInput {
  full_name?: string;
  photo_url?: string | null;
}

export function useUpdateMyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UserProfileUpdateInput) => (await apiClient.patch<UserRead>('/users/me', data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session'] }),
  });
}

export function useChangeMyPassword() {
  return useMutation({
    mutationFn: async (data: { current_password: string; new_password: string }) =>
      apiClient.post('/users/me/change-password', data),
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: async ({ id, new_password }: { id: string; new_password: string }) =>
      apiClient.post(`/users/${id}/reset-password`, { new_password }),
  });
}
