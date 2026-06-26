import dayjs from 'dayjs';
import { useAttendanceRecords } from '@/api/hooks/useAttendance';
import { useAuthStore } from '@/store/auth-store';

export function useAttendanceGate(projectId: string | null, date?: string) {
  const { data: attendance, isLoading } = useAttendanceRecords(projectId);
  const user = useAuthStore((s) => s.user);
  const checkDate = date ?? dayjs().format('YYYY-MM-DD');

  const hasMarkedToday = (attendance ?? []).some(
    (a) => a.attendance_date === checkDate && a.marked_by === user?.id,
  );

  return { hasMarkedToday, isLoading: isLoading && !!projectId };
}
