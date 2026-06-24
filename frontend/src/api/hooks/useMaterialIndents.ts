import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export type MaterialIndentStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'ISSUED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export interface MaterialIndentItemRead {
  id: string;
  material_id: string;
  uom_id: string;
  requested_qty: string;
  issued_qty: string;
  received_qty: string;
}

export interface MaterialIndentRead {
  id: string;
  requesting_project_id: string;
  source_type: 'HEAD_OFFICE' | 'SITE_TRANSFER';
  source_location_id: string;
  requested_by: string;
  status: MaterialIndentStatus;
  approved_by: string | null;
  approved_at: string | null;
  needed_by_date: string | null;
  items: MaterialIndentItemRead[];
}

export interface MaterialIndentCreateInput {
  requesting_project_id: string;
  source_type: 'HEAD_OFFICE' | 'SITE_TRANSFER';
  source_location_id: string;
  needed_by_date?: string;
  items: { material_id: string; uom_id: string; requested_qty: string }[];
}

export function useMaterialIndents(projectId: string | null) {
  return useQuery({
    queryKey: ['material-indents', projectId],
    queryFn: async () =>
      (await apiClient.get<MaterialIndentRead[]>(`/material-indents/by-project/${projectId}`)).data,
    enabled: !!projectId,
  });
}

export function useCreateMaterialIndent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: MaterialIndentCreateInput) =>
      (await apiClient.post<MaterialIndentRead>('/material-indents', data)).data,
    onSuccess: (indent) =>
      queryClient.invalidateQueries({ queryKey: ['material-indents', indent.requesting_project_id] }),
  });
}

function useIndentAction(action: 'submit' | 'approve' | 'reject' | 'cancel') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.post<MaterialIndentRead>(`/material-indents/${id}/${action}`)).data,
    onSuccess: (indent) =>
      queryClient.invalidateQueries({ queryKey: ['material-indents', indent.requesting_project_id] }),
  });
}

export const useSubmitIndent = () => useIndentAction('submit');
export const useApproveIndent = () => useIndentAction('approve');
export const useRejectIndent = () => useIndentAction('reject');
export const useCancelIndent = () => useIndentAction('cancel');

export function useIssueIndentItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      issuedQty,
      vehicleRef,
    }: {
      itemId: string;
      issuedQty: string;
      vehicleRef?: string;
    }) =>
      (
        await apiClient.post<MaterialIndentItemRead>(`/material-indents/items/${itemId}/issue`, {
          issued_qty: issuedQty,
          vehicle_ref: vehicleRef,
        })
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['material-indents'] }),
  });
}

export function useReceiveIndentItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      receivedQty,
      photoUrl,
      remarks,
    }: {
      itemId: string;
      receivedQty: string;
      photoUrl?: string;
      remarks?: string;
    }) =>
      (
        await apiClient.post<MaterialIndentItemRead>(`/material-indents/items/${itemId}/receive`, {
          received_qty: receivedQty,
          photo_url: photoUrl,
          remarks,
        })
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['material-indents'] }),
  });
}
