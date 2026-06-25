import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface WorkerPaymentRead {
  id: string;
  worker_id: string;
  project_id: string;
  payment_date: string;
  payment_type: 'ADVANCE' | 'PAYMENT' | 'DEDUCTION';
  amount: string;
  remarks: string | null;
  recorded_by: string;
}

export interface WorkerLedgerRead {
  worker_id: string;
  worker_name: string;
  worker_type: string;
  wage_unit: string | null;
  project_id: string;
  total_earned: string;
  total_paid: string;
  total_deducted: string;
  balance_pending: string;
  payments: WorkerPaymentRead[];
}

export interface WorkerLedgerSummaryRow {
  worker_id: string;
  worker_name: string;
  worker_type: string;
  wage_unit: string | null;
  total_earned: string;
  total_paid: string;
  total_deducted: string;
  balance_pending: string;
}

export interface WorkerPaymentCreateInput {
  worker_id: string;
  project_id: string;
  payment_date: string;
  payment_type: 'ADVANCE' | 'PAYMENT' | 'DEDUCTION';
  amount: string;
  remarks?: string;
}

export function useWorkerLedgerSummary(projectId: string | null) {
  return useQuery({
    queryKey: ['worker-ledger-summary', projectId],
    queryFn: async () =>
      (await apiClient.get<WorkerLedgerSummaryRow[]>(`/worker-ledger/${projectId}/summary`)).data,
    enabled: !!projectId,
  });
}

export function useWorkerLedger(projectId: string | null, workerId: string | null) {
  return useQuery({
    queryKey: ['worker-ledger', projectId, workerId],
    queryFn: async () =>
      (await apiClient.get<WorkerLedgerRead>(`/worker-ledger/${projectId}/${workerId}`)).data,
    enabled: !!projectId && !!workerId,
  });
}

export function useAddWorkerPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: WorkerPaymentCreateInput) =>
      (await apiClient.post<WorkerPaymentRead>('/worker-ledger/payments', data)).data,
    onSuccess: (payment) => {
      queryClient.invalidateQueries({ queryKey: ['worker-ledger-summary', payment.project_id] });
      queryClient.invalidateQueries({ queryKey: ['worker-ledger', payment.project_id, payment.worker_id] });
    },
  });
}

export function useDeleteWorkerPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ paymentId, projectId, workerId }: { paymentId: string; projectId: string; workerId: string }) => {
      await apiClient.delete(`/worker-ledger/payments/${paymentId}`);
      return { projectId, workerId };
    },
    onSuccess: ({ projectId, workerId }) => {
      queryClient.invalidateQueries({ queryKey: ['worker-ledger-summary', projectId] });
      queryClient.invalidateQueries({ queryKey: ['worker-ledger', projectId, workerId] });
    },
  });
}
