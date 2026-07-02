import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface ExpenseRead {
  id: string;
  project_id: string;
  expense_category_id: string;
  amount: string;
  expense_date: string;
  dpr_header_id: string | null;
  vendor_name: string | null;
  bill_photo_url: string | null;
  remarks: string | null;
  paid_by: string;
  edited_by: string | null;
  edited_at: string | null;
}

export interface ExpenseCreateInput {
  project_id: string;
  expense_category_id: string;
  amount: string;
  expense_date: string;
  dpr_header_id?: string;
  vendor_name?: string;
  bill_photo_url?: string;
  remarks?: string;
}

export interface ExpenseUpdateInput {
  expense_category_id?: string;
  amount?: string;
  expense_date?: string;
  vendor_name?: string;
  bill_photo_url?: string;
  remarks?: string;
}

export function useExpenses(projectId: string | null) {
  return useQuery({
    queryKey: ['expenses', projectId],
    queryFn: async () => (await apiClient.get<ExpenseRead[]>(`/expenses/by-project/${projectId}`)).data,
    enabled: !!projectId,
  });
}

export function useExpensesByHeader(headerId: string | null) {
  return useQuery({
    queryKey: ['expenses-by-header', headerId],
    queryFn: async () => (await apiClient.get<ExpenseRead[]>(`/expenses/by-header/${headerId}`)).data,
    enabled: !!headerId,
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ExpenseCreateInput) => (await apiClient.post<ExpenseRead>('/expenses', data)).data,
    onSuccess: (expense) => {
      queryClient.invalidateQueries({ queryKey: ['expenses', expense.project_id] });
      if (expense.dpr_header_id) {
        queryClient.invalidateQueries({ queryKey: ['expenses-by-header', expense.dpr_header_id] });
      }
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ExpenseUpdateInput }) =>
      (await apiClient.patch<ExpenseRead>(`/expenses/${id}`, data)).data,
    onSuccess: (expense) => {
      queryClient.invalidateQueries({ queryKey: ['expenses', expense.project_id] });
      if (expense.dpr_header_id) {
        queryClient.invalidateQueries({ queryKey: ['expenses-by-header', expense.dpr_header_id] });
      }
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId, headerId }: { id: string; projectId: string; headerId?: string }) => {
      await apiClient.delete(`/expenses/${id}`);
      return { projectId, headerId };
    },
    onSuccess: ({ projectId, headerId }) => {
      queryClient.invalidateQueries({ queryKey: ['expenses', projectId] });
      if (headerId) {
        queryClient.invalidateQueries({ queryKey: ['expenses-by-header', headerId] });
      }
    },
  });
}
