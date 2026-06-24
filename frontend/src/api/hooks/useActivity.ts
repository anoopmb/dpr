import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

export interface ActivityEntry {
  activity_date: string;
  type: string;
  description: string;
  project_id: string;
  project_name: string;
  link_url: string;
}

export interface ActivityListRead {
  items: ActivityEntry[];
}

export function useMyActivity() {
  return useQuery({
    queryKey: ['my-activity'],
    queryFn: async () => (await apiClient.get<ActivityListRead>('/users/me/activity')).data,
  });
}
