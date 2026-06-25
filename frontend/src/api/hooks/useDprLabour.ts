import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface DprLabourRead {
  id: string;
  dpr_header_id: string;
  worker_id: string;
  worker_name: string;
  worker_type: string;
  wage_unit: string | null;
  quantity: string;
  rate: string;
  amount: string;
  contractor_workers_count: number | null;
  remarks: string | null;
}

export interface DprLabourSuggestion {
  worker_id: string;
  worker_name: string;
  worker_type: string;
  wage_unit: string | null;
  quantity: string;
  rate: string;
  amount: string;
}

export interface DprLabourCreateInput {
  worker_id: string;
  quantity: string;
  rate: string;
  contractor_workers_count?: number;
  remarks?: string;
}

export interface DprLabourUpdateInput {
  quantity?: string;
  rate?: string;
  contractor_workers_count?: number | null;
  remarks?: string | null;
}

export function useDprLabour(headerId: string | null) {
  return useQuery({
    queryKey: ['dpr-labour', headerId],
    queryFn: async () => (await apiClient.get<DprLabourRead[]>(`/dpr/${headerId}/labour`)).data,
    enabled: !!headerId,
  });
}

export function useDprLabourSuggestions(headerId: string | null) {
  return useQuery({
    queryKey: ['dpr-labour-suggestions', headerId],
    queryFn: async () =>
      (await apiClient.get<DprLabourSuggestion[]>(`/dpr/${headerId}/labour/suggestions`)).data,
    enabled: !!headerId,
  });
}

export function useAddDprLabour() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ headerId, data }: { headerId: string; data: DprLabourCreateInput }) =>
      (await apiClient.post<DprLabourRead>(`/dpr/${headerId}/labour`, data)).data,
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: ['dpr-labour', entry.dpr_header_id] });
      queryClient.invalidateQueries({ queryKey: ['dpr-labour-suggestions', entry.dpr_header_id] });
    },
  });
}

export function useUpdateDprLabour() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: DprLabourUpdateInput }) =>
      (await apiClient.patch<DprLabourRead>(`/dpr/labour/${itemId}`, data)).data,
    onSuccess: (entry) => queryClient.invalidateQueries({ queryKey: ['dpr-labour', entry.dpr_header_id] }),
  });
}

export function useDeleteDprLabour() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, headerId }: { itemId: string; headerId: string }) => {
      await apiClient.delete(`/dpr/labour/${itemId}`);
      return headerId;
    },
    onSuccess: (headerId) => queryClient.invalidateQueries({ queryKey: ['dpr-labour', headerId] }),
  });
}
