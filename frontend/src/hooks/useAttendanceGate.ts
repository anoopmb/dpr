import dayjs from 'dayjs';
import { useAttendanceRecords } from '@/api/hooks/useAttendance';
import { useAuthStore } from '@/store/auth-store';

/**
 * Gate for field screens: has the logged-in user marked at least one
 * worker's attendance for this project today? Reuses the existing
 * AttendanceRecord data (marked_by) — no separate "own check-in" concept.
 */
export function useAttendanceGate(projectId: string | null) {
  const { data: attendance, isLoading } = useAttendanceRecords(projectId);
  const user = useAuthStore((s) => s.user);
  const today = dayjs().format('YYYY-MM-DD');

  const hasMarkedToday = (attendance ?? []).some(
    (a) => a.attendance_date === today && a.marked_by === user?.id,
  );

  return { hasMarkedToday, isLoading: isLoading && !!projectId };
}
