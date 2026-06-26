import type { ReactNode } from 'react';
import { Alert, Button, Skeleton } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAttendanceGate } from '@/hooks/useAttendanceGate';

/**
 * Blocks field screens (DPR, Materials, Machinery, Measurements) until the
 * logged-in user has marked at least one worker's attendance for the
 * selected project today. The Attendance screen itself is never wrapped in
 * this — it's the escape hatch.
 */
export function RequireAttendance({ projectId, date, children }: { projectId: string | null; date?: string; children: ReactNode }) {
  const navigate = useNavigate();
  const { hasMarkedToday, isLoading } = useAttendanceGate(projectId, date);

  if (!projectId) return <>{children}</>;
  if (isLoading) return <Skeleton active />;

  if (!hasMarkedToday) {
    return (
      <Alert
        type="warning"
        showIcon
        message="Mark attendance first"
        description="Mark at least one worker's attendance for this project today before continuing here."
        action={
          <Button size="small" type="primary" onClick={() => navigate('/field/workers')}>
            Go to Attendance
          </Button>
        }
      />
    );
  }

  return <>{children}</>;
}
