import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

export interface OrganizationSettingsRead {
  id: string;
  company_name: string;
  company_logo_light_url: string | null;
  company_logo_dark_url: string | null;
  company_logo_small_light_url: string | null;
  company_logo_small_dark_url: string | null;
  favicon_url: string | null;
  company_address: string | null;
  gst_number: string | null;
  currency_code: string;
  currency_symbol: string;
  date_format: DateFormat;
  timezone: string;
  decimal_places: number;
  use_thousands_separator: boolean;
  fiscal_year_start_month: number;
  default_measurement_tolerance_percent: string;
  email_notifications_enabled: boolean;
}

export interface OrganizationSettingsUpdateInput {
  company_name?: string;
  company_logo_light_url?: string | null;
  company_logo_dark_url?: string | null;
  company_logo_small_light_url?: string | null;
  company_logo_small_dark_url?: string | null;
  favicon_url?: string | null;
  company_address?: string | null;
  gst_number?: string | null;
  currency_code?: string;
  currency_symbol?: string;
  date_format?: DateFormat;
  timezone?: string;
  decimal_places?: number;
  use_thousands_separator?: boolean;
  fiscal_year_start_month?: number;
  default_measurement_tolerance_percent?: number;
  email_notifications_enabled?: boolean;
}

export interface OrganizationBrandingRead {
  company_name: string;
  company_logo_light_url: string | null;
  company_logo_dark_url: string | null;
  company_logo_small_light_url: string | null;
  company_logo_small_dark_url: string | null;
  favicon_url: string | null;
}

const QUERY_KEY = ['organization-settings'];
const BRANDING_QUERY_KEY = ['organization-branding'];

export function useOrganizationSettings() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await apiClient.get<OrganizationSettingsRead>('/settings/organization')).data,
    staleTime: 5 * 60_000,
  });
}

export function useUpdateOrganizationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: OrganizationSettingsUpdateInput) =>
      (await apiClient.patch<OrganizationSettingsRead>('/settings/organization', data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: BRANDING_QUERY_KEY });
    },
  });
}

/** Public, unauthenticated — backs the login page and the dynamic favicon. */
export function useOrganizationBranding() {
  return useQuery({
    queryKey: BRANDING_QUERY_KEY,
    queryFn: async () => (await apiClient.get<OrganizationBrandingRead>('/settings/branding')).data,
    staleTime: 5 * 60_000,
  });
}
