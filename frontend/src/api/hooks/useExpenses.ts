import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface ExpenseRead {
  id: string;
  project_id: string;
  expense_category_id: string;
  amount: string;
  expense_date: string;
  vendor_name: string | null;
  bill_photo_url: string | null;
  remarks: string | null;
  paid_by: string;
}

export interface ExpenseCreateInput {
  project_id: string;
  expense_category_id: string;
  amount: string;
  expense_date: string;
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

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ExpenseCreateInput) => (await apiClient.post<ExpenseRead>('/expenses', data)).data,
    onSuccess: (expense) => queryClient.invalidateQueries({ queryKey: ['expenses', expense.project_id] }),
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ExpenseUpdateInput }) =>
      (await apiClient.patch<ExpenseRead>(`/expenses/${id}`, data)).data,
    onSuccess: (expense) => queryClient.invalidateQueries({ queryKey: ['expenses', expense.project_id] }),
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      await apiClient.delete(`/expenses/${id}`);
      return projectId;
    },
    onSuccess: (projectId) => queryClient.invalidateQueries({ queryKey: ['expenses', projectId] }),
  });
}
