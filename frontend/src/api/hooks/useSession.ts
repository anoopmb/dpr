import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { AuthUser, UserRole } from '@/store/auth-store';
import { getCookie } from '@/utils/cookies';

interface MeResponse {
  id: string;
  login_id: string;
  full_name: string;
  email: string;
  photo_url: string | null;
  role: UserRole;
}

async function fetchSession(): Promise<AuthUser | null> {
  if (!getCookie('csrf_token')) return null;
  const { data } = await apiClient.get<MeResponse>('/auth/me');
  return {
    id: data.id,
    loginId: data.login_id,
    fullName: data.full_name,
    email: data.email,
    photoUrl: data.photo_url,
    role: data.role,
  };
}

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: fetchSession,
    retry: false,
    staleTime: 5 * 60_000,
  });
}
