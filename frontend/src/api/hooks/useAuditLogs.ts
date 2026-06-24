import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE';

export interface AuditLogRead {
  id: string;
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  actor_id: string;
  actor_name: string;
  actor_login_id: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogFilters {
  entity_type?: string;
  action?: AuditAction;
  actor_id?: string;
  from_date?: string;
  to_date?: string;
  limit: number;
  offset: number;
}

export function useAuditLogs(filters: AuditLogFilters) {
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(filters.limit), offset: String(filters.offset) });
      if (filters.entity_type) params.set('entity_type', filters.entity_type);
      if (filters.action) params.set('action', filters.action);
      if (filters.actor_id) params.set('actor_id', filters.actor_id);
      if (filters.from_date) params.set('from_date', filters.from_date);
      if (filters.to_date) params.set('to_date', filters.to_date);
      return (await apiClient.get<{ items: AuditLogRead[] }>(`/audit-logs?${params.toString()}`)).data;
    },
  });
}

export function useAuditEntityTypes() {
  return useQuery({
    queryKey: ['audit-log-entity-types'],
    queryFn: async () => (await apiClient.get<{ entity_types: string[] }>('/audit-logs/entity-types')).data,
    staleTime: 60_000,
  });
}
