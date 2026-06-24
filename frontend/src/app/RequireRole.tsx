import type { ReactNode } from 'react';
import { Result } from 'antd';
import { useAuthStore, type UserRole } from '@/store/auth-store';

export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const user = useAuthStore((state) => state.user);

  if (!user || !roles.includes(user.role)) {
    return (
      <Result
        status="403"
        title="403"
        subTitle={`Your role (${user?.role ?? 'unknown'}) does not have access to this page.`}
      />
    );
  }

  return <>{children}</>;
}
