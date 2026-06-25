import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface ExpenseCategoryBreakdown {
  category_name: string;
  amount: string;
}

export interface DailyProfitabilityRead {
  date: string;
  production_value: string;
  machinery_cost: string;
  material_cost: string;
  labour_cost: string;
  expense_cost: string;
  total_cost: string;
  net_profit: string;
  profit_percent: string | null;
}

export interface ProfitabilityRead {
  from_date: string;
  to_date: string;
  production_value: string;
  machinery_cost: string;
  material_cost: string;
  labour_cost: string;
  expense_cost: string;
  total_cost: string;
  net_profit: string;
  profit_percent: string | null;
  expense_by_category: ExpenseCategoryBreakdown[];
  daily: DailyProfitabilityRead[];
}

export function useProfitability(projectId: string | null, fromDate?: string, toDate?: string) {
  return useQuery({
    queryKey: ['profitability', projectId, fromDate, toDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return (await apiClient.get<ProfitabilityRead>(`/projects/${projectId}/profitability${qs}`)).data;
    },
    enabled: !!projectId,
  });
}
