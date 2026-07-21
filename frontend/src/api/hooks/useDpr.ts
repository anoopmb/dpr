import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export type IssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DprWorkItemRead {
  id: string;
  boq_item_id: string;
  qty_today: string;
  notes: string | null;
}
export interface DprIssueRead {
  id: string;
  description: string;
  severity: IssueSeverity;
  owner_user_id: string | null;
  status: 'OPEN' | 'RESOLVED';
  photo_url: string | null;
}
export interface DprMaterialRead {
  id: string;
  material_id: string;
  qty_consumed: string;
  uom_id: string;
  rate: string | null;
  manually_edited: boolean;
  source_measurement_id: string | null;
  edited_by: string | null;
  edited_at: string | null;
}
export interface DprMachineryRead {
  id: string;
  machinery_id: string;
  quantity_used: string;
  hire_unit: string;
  hire_rate: string | null;
  edited_by: string | null;
  edited_at: string | null;
}

// DRAFT/SUBMITTED are fixed bookends; the terminal "fully approved" value is
// always the literal "APPROVED" (enforced server-side), but an admin can add
// additional intermediate approval levels with their own status codes before
// reaching it — so this isn't a closed union.
export type DprStatus = string;

export interface DprHeaderRead {
  id: string;
  project_id: string;
  report_date: string;
  weather: string | null;
  daily_work_summary: string | null;
  supervisor_name: string | null;
  no_work: boolean;
  no_work_reason: string | null;
  submitted_by: string;
  submitted_at: string | null;
  status: DprStatus;
  approved_by: string | null;
  approved_at: string | null;
  work_items: DprWorkItemRead[];
  issues: DprIssueRead[];
  materials: DprMaterialRead[];
  machinery_entries: DprMachineryRead[];
  // Times this DPR was returned to DRAFT after submission (from approval
  // history). Populated by the project-list endpoint; 0 elsewhere.
  return_count: number;
}

export interface DprHeaderApprovalRead {
  id: string;
  dpr_header_id: string;
  from_status: string;
  to_status: string;
  acted_by: string;
  actor_name: string;
  remarks: string | null;
  acted_at: string;
}

export interface DprProductionEntryRead {
  id: string;
  dpr_header_id: string;
  boq_item_id: string;
  qty_today: string;
  amount_today: string;
  rate_snapshot: string;
  chainage: string | null;
  remarks: string | null;
}

export interface DprProductionEntryUpsert {
  boq_item_id: string;
  qty_today: string;
  chainage?: string | null;
  remarks?: string | null;
}

export interface DprProductionBulkUpsert {
  daily_work_summary?: string | null;
  entries: DprProductionEntryUpsert[];
}

export interface BoqItemProgressRead {
  boq_item_id: string;
  section_id: string | null;
  section_no: string | null;
  section_name: string | null;
  item_no: string;
  description: string;
  unit: string;
  rate: string;
  current_rate: string;
  agreed_qty: string;
  current_tendered_qty: string;
  executed_qty: string;
  executed_amount: string;
  remaining_qty: string;
  percent_complete: string | null;
}

export interface SectionProgressRead {
  section_id: string | null;
  section_no: string | null;
  section_name: string;
  items: BoqItemProgressRead[];
  section_agreed_amount: string;
  section_executed_amount: string;
}

export interface ProductionProgressRead {
  as_of_date: string;
  sections: SectionProgressRead[];
  total_agreed_amount: string;
  total_executed_amount: string;
}

export interface DailyProductionCell {
  day: number;
  qty: string;
  amount: string;
}

export interface DprReportItemRead {
  boq_item_id: string;
  item_no: string;
  description: string;
  unit: string;
  rate: string;
  current_rate: string;
  agreed_qty: string;
  current_tendered_qty: string;
  opening_qty: string;
  opening_amount: string;
  daily: DailyProductionCell[];
  closing_qty: string;
  closing_amount: string;
}

export interface DprReportSectionRead {
  section_id: string | null;
  section_no: string | null;
  section_name: string;
  items: DprReportItemRead[];
  section_agreed_amount: string;
  section_closing_amount: string;
}

export interface DailyAmountCell {
  day: number;
  amount: string;
}

export interface MaterialConsumptionRow {
  material_id: string;
  name: string;
  category: string | null;
  unit: string;
  daily: DailyProductionCell[];
  total_qty: string;
  total_amount: string;
}

export interface MachineryUsageRow {
  machinery_id: string;
  name: string;
  unit: string;
  daily: DailyProductionCell[];
  total_qty: string;
  total_amount: string;
}

export interface LabourRow {
  worker_category_id: string;
  name: string;
  daily_rate: string | null;
  daily: DailyProductionCell[];
  total_qty: string;
  total_amount: string;
}

export interface ExpenseCategoryRow {
  expense_category_id: string;
  name: string;
  daily: DailyAmountCell[];
  total_amount: string;
}

export interface DailySummaryCell {
  day: number;
  income: string;
  expense: string;
  profit_loss: string;
  profit_loss_pct: string | null;
  cumulative_income: string;
  cumulative_expense: string;
}

export interface DprMonthlyReportRead {
  project_id: string;
  month: string;
  days_in_month: number;
  prepared_by_name: string | null;
  verified_by_name: string | null;
  sections: DprReportSectionRead[];
  total_agreed_amount: string;
  total_closing_amount: string;
  materials: MaterialConsumptionRow[];
  machinery: MachineryUsageRow[];
  labour: LabourRow[];
  expenses: ExpenseCategoryRow[];
  summary: DailySummaryCell[];
}

export function useDprList(projectId: string | null) {
  return useQuery({
    queryKey: ['dpr', projectId],
    queryFn: async () => (await apiClient.get<DprHeaderRead[]>(`/dpr/by-project/${projectId}`)).data,
    enabled: !!projectId,
  });
}

export function useDprHeader(headerId: string | null) {
  return useQuery({
    queryKey: ['dpr-header', headerId],
    queryFn: async () => (await apiClient.get<DprHeaderRead>(`/dpr/${headerId}`)).data,
    enabled: !!headerId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useDprProduction(headerId: string | null) {
  return useQuery({
    queryKey: ['dpr-production', headerId],
    queryFn: async () =>
      (await apiClient.get<DprProductionEntryRead[]>(`/dpr/${headerId}/production`)).data,
    enabled: !!headerId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useProductionProgress(projectId: string | null, asOf?: string) {
  return useQuery({
    queryKey: ['production-progress', projectId, asOf],
    queryFn: async () => {
      const params = asOf ? `?as_of=${asOf}` : '';
      return (await apiClient.get<ProductionProgressRead>(`/dpr/progress/${projectId}${params}`)).data;
    },
    enabled: !!projectId,
  });
}

export function useDprMonthlyReport(projectId: string | null, month: string) {
  return useQuery({
    queryKey: ['dpr-report', projectId, month],
    queryFn: async () =>
      (await apiClient.get<DprMonthlyReportRead>(`/dpr/report/${projectId}?month=${month}`)).data,
    enabled: !!projectId && !!month,
  });
}

export function useCreateDprHeader() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      project_id: string;
      report_date: string;
      weather?: string;
      daily_work_summary?: string | null;
      supervisor_name?: string | null;
      no_work?: boolean;
      no_work_reason?: string | null;
    }) => (await apiClient.post<DprHeaderRead>('/dpr', data)).data,
    onSuccess: (header) => queryClient.invalidateQueries({ queryKey: ['dpr', header.project_id] }),
  });
}

export function useUpdateDprHeader() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      headerId,
      data,
    }: {
      headerId: string;
      data: {
        weather?: string | null;
        daily_work_summary?: string | null;
        supervisor_name?: string | null;
        no_work?: boolean;
        no_work_reason?: string | null;
      };
    }) => (await apiClient.patch<DprHeaderRead>(`/dpr/${headerId}`, data)).data,
    onSuccess: (header) => {
      queryClient.invalidateQueries({ queryKey: ['dpr-header', header.id] });
      queryClient.invalidateQueries({ queryKey: ['dpr', header.project_id] });
    },
  });
}

export function useBulkUpsertProduction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ headerId, data }: { headerId: string; data: DprProductionBulkUpsert }) =>
      (await apiClient.put<DprProductionEntryRead[]>(`/dpr/${headerId}/production`, data)).data,
    onSuccess: (_, { headerId }) => {
      queryClient.invalidateQueries({ queryKey: ['dpr-production', headerId] });
      queryClient.invalidateQueries({ queryKey: ['dpr-header', headerId] });
    },
  });
}

function invalidateHeader(queryClient: ReturnType<typeof useQueryClient>, header: DprHeaderRead) {
  queryClient.invalidateQueries({ queryKey: ['dpr-header', header.id] });
  queryClient.invalidateQueries({ queryKey: ['dpr', header.project_id] });
}

export function useAddDprWorkItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ headerId, data }: { headerId: string; data: { boq_item_id: string; qty_today: string; notes?: string } }) =>
      (await apiClient.post<DprHeaderRead>(`/dpr/${headerId}/work-items`, data)).data,
    onSuccess: (header) => invalidateHeader(queryClient, header),
  });
}

export function useAddDprIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      headerId,
      data,
    }: {
      headerId: string;
      data: { description: string; severity: IssueSeverity; owner_user_id?: string; photo_url?: string };
    }) => (await apiClient.post<DprHeaderRead>(`/dpr/${headerId}/issues`, data)).data,
    onSuccess: (header) => invalidateHeader(queryClient, header),
  });
}

export function useAddDprMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      headerId,
      data,
    }: {
      headerId: string;
      data: { material_id: string; qty_consumed: string; uom_id: string; rate?: string };
    }) => (await apiClient.post<DprHeaderRead>(`/dpr/${headerId}/materials`, data)).data,
    onSuccess: (header) => invalidateHeader(queryClient, header),
  });
}

export function useAddDprMachinery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      headerId,
      data,
    }: { headerId: string; data: { machinery_id: string; quantity_used: string; hire_rate?: string } }) =>
      (await apiClient.post<DprHeaderRead>(`/dpr/${headerId}/machinery`, data)).data,
    onSuccess: (header) => invalidateHeader(queryClient, header),
  });
}

export function useSubmitDpr() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (headerId: string) => (await apiClient.post<DprHeaderRead>(`/dpr/${headerId}/submit`)).data,
    onSuccess: (header) => invalidateHeader(queryClient, header),
  });
}

export function useUpdateDprMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      data,
    }: {
      itemId: string;
      data: { qty_consumed: string; uom_id: string; rate?: string };
    }) => (await apiClient.patch<DprHeaderRead>(`/dpr/materials/${itemId}`, data)).data,
    onSuccess: (header) => invalidateHeader(queryClient, header),
  });
}

export function useDeleteDprMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, headerId }: { itemId: string; headerId: string }) => {
      await apiClient.delete(`/dpr/materials/${itemId}`);
      return headerId;
    },
    onSuccess: (headerId) => {
      queryClient.invalidateQueries({ queryKey: ['dpr-header', headerId] });
    },
  });
}

export function useUpdateDprMaterialRates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      headerId,
      ids,
      rate,
    }: {
      headerId: string;
      ids: string[];
      rate?: string | null;
    }) => (await apiClient.patch<DprHeaderRead>(`/dpr/${headerId}/materials/rate`, { ids, rate })).data,
    onSuccess: (header) => invalidateHeader(queryClient, header),
  });
}

export function useUpdateDprMachinery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      data,
    }: {
      itemId: string;
      data: { quantity_used: string; hire_rate?: string | null };
    }) => (await apiClient.patch<DprHeaderRead>(`/dpr/machinery/${itemId}`, data)).data,
    onSuccess: (header) => invalidateHeader(queryClient, header),
  });
}

export function useDeleteDprMachinery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, headerId }: { itemId: string; headerId: string }) => {
      await apiClient.delete(`/dpr/machinery/${itemId}`);
      return headerId;
    },
    onSuccess: (headerId) => {
      queryClient.invalidateQueries({ queryKey: ['dpr-header', headerId] });
    },
  });
}

export function useDeleteDprHeader() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ headerId, projectId }: { headerId: string; projectId: string }) => {
      await apiClient.delete(`/dpr/${headerId}`);
      return projectId;
    },
    onSuccess: (projectId) => {
      queryClient.invalidateQueries({ queryKey: ['dpr', projectId] });
    },
  });
}

export function useApproveDpr() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ headerId, remarks }: { headerId: string; remarks?: string }) =>
      (await apiClient.post<DprHeaderRead>(`/dpr/${headerId}/approve`, { remarks })).data,
    onSuccess: (header) => invalidateHeader(queryClient, header),
  });
}

export function useRejectDpr() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ headerId, remarks }: { headerId: string; remarks: string }) =>
      (await apiClient.post<DprHeaderRead>(`/dpr/${headerId}/reject`, { remarks })).data,
    onSuccess: (header) => invalidateHeader(queryClient, header),
  });
}

export function useDprApprovals(headerId: string | null) {
  return useQuery({
    queryKey: ['dpr-approvals', headerId],
    queryFn: async () =>
      (await apiClient.get<DprHeaderApprovalRead[]>(`/dpr/${headerId}/approvals`)).data,
    enabled: !!headerId,
  });
}

export function useDprMeasurements(headerId: string | null) {
  return useQuery({
    queryKey: ['dpr-measurements', headerId],
    queryFn: async () =>
      (await apiClient.get<import('./useMeasurements').MeasurementRead[]>(`/dpr/${headerId}/measurements`)).data,
    enabled: !!headerId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
