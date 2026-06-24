import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface RunningBillItemRead {
  id: string;
  measurement_id: string;
  boq_item_id: string;
  billed_qty: string;
  rate: string;
  amount: string;
}

export interface RunningBillRead {
  id: string;
  project_id: string;
  bill_number: string;
  bill_date: string;
  from_date: string;
  to_date: string;
  total_amount: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID';
  generated_by: string;
  items: RunningBillItemRead[];
}

export interface RunningBillCreateInput {
  project_id: string;
  bill_number: string;
  bill_date: string;
  from_date: string;
  to_date: string;
  measurement_ids: string[];
}

export interface PaymentReceivedRead {
  id: string;
  running_bill_id: string;
  amount_received: string;
  received_date: string;
  reference_no: string | null;
  recorded_by: string;
}

export function useRunningBills(projectId: string | null) {
  return useQuery({
    queryKey: ['running-bills', projectId],
    queryFn: async () => (await apiClient.get<RunningBillRead[]>(`/running-bills/by-project/${projectId}`)).data,
    enabled: !!projectId,
  });
}

export function useCreateRunningBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: RunningBillCreateInput) =>
      (await apiClient.post<RunningBillRead>('/running-bills', data)).data,
    onSuccess: (bill) => {
      queryClient.invalidateQueries({ queryKey: ['running-bills', bill.project_id] });
      queryClient.invalidateQueries({ queryKey: ['measurements', bill.project_id] });
    },
  });
}

export function usePayments(billId: string | null) {
  return useQuery({
    queryKey: ['payments', billId],
    queryFn: async () => (await apiClient.get<PaymentReceivedRead[]>(`/running-bills/${billId}/payments`)).data,
    enabled: !!billId,
  });
}

export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      billId,
      data,
    }: {
      billId: string;
      data: { amount_received: string; received_date: string; reference_no?: string };
    }) => (await apiClient.post<PaymentReceivedRead>(`/running-bills/${billId}/payments`, data)).data,
    onSuccess: (payment) => {
      queryClient.invalidateQueries({ queryKey: ['payments', payment.running_bill_id] });
      queryClient.invalidateQueries({ queryKey: ['running-bills'] });
    },
  });
}
