import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Spin } from 'antd';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthStore } from '@/store/auth-store';
import { useSession } from '@/api/hooks/useSession';
import { RequireRole } from '@/app/RequireRole';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { AnalyticsPage } from '@/features/dashboard/AnalyticsPage';
import { ProjectsListPage } from '@/features/projects/ProjectsListPage';
import { BoqPage } from '@/features/boq/BoqPage';
import { MeasurementsPage } from '@/features/measurements/MeasurementsPage';
import { MaterialIndentsPage } from '@/features/material/MaterialIndentsPage';
import { WorkersPage } from '@/features/workers/WorkersPage';
import { BillingPage } from '@/features/billing/BillingPage';
import { ExpensesPage } from '@/features/expenses/ExpensesPage';
import { MastersPage } from '@/features/masters/MastersPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { DprTodayPage } from '@/features/field/DprTodayPage';
import { MaterialsUsedPage } from '@/features/field/MaterialsUsedPage';
import { MachineryUsedPage } from '@/features/field/MachineryUsedPage';
import { AttendanceCheckInPage } from '@/features/field/AttendanceCheckInPage';
import { MeasurementEntryPage } from '@/features/field/MeasurementEntryPage';
import { ProductionProgressPage } from '@/features/dpr/ProductionProgressPage';
import { ProfitabilityPage } from '@/features/dpr/ProfitabilityPage';
import { DprHistoryPage } from '@/features/dpr/DprHistoryPage';
import { UsersPage } from '@/features/users/UsersPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { WorkerEarningsPage } from '@/features/reports/WorkerEarningsPage';
import { MyMeasurementsPage } from '@/features/field/MyMeasurementsPage';
import { MyMaterialIndentsPage } from '@/features/field/MyMaterialIndentsPage';
import { DprMonthlyReportPage } from '@/features/dpr/DprMonthlyReportPage';

const FIELD_ROLES = ['SITE_ENGINEER', 'PROJECT_MANAGER', 'ADMIN'] as const;

function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isLoading, isError } = useSession();
  const setUser = useAuthStore((state) => state.setUser);

  useEffect(() => {
    if (user) setUser(user);
  }, [user, setUser]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (isError || !user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <AppLayout>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route
                  path="/analytics"
                  element={
                    <RequireRole roles={['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN']}>
                      <AnalyticsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/projects"
                  element={
                    <RequireRole roles={['PROJECT_MANAGER', 'ADMIN']}>
                      <ProjectsListPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/boq"
                  element={
                    <RequireRole roles={['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN']}>
                      <BoqPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/measurements"
                  element={
                    <RequireRole roles={['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN']}>
                      <MeasurementsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/material-indents"
                  element={
                    <RequireRole roles={['PROJECT_MANAGER', 'STORE_KEEPER', 'ADMIN']}>
                      <MaterialIndentsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/workers"
                  element={
                    <RequireRole roles={['PROJECT_MANAGER', 'ADMIN']}>
                      <WorkersPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/expenses"
                  element={
                    <RequireRole roles={['PROJECT_MANAGER', 'STORE_KEEPER', 'ADMIN']}>
                      <ExpensesPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/billing"
                  element={
                    <RequireRole roles={['QUANTITY_SURVEYOR', 'PROJECT_MANAGER', 'ADMIN']}>
                      <BillingPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/masters"
                  element={
                    <RequireRole roles={['ADMIN']}>
                      <MastersPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/users"
                  element={
                    <RequireRole roles={['ADMIN']}>
                      <UsersPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/worker-earnings"
                  element={
                    <RequireRole roles={['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN']}>
                      <WorkerEarningsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <RequireRole roles={['PROJECT_MANAGER', 'ADMIN']}>
                      <SettingsPage />
                    </RequireRole>
                  }
                />

                <Route
                  path="/field/dpr-today"
                  element={
                    <RequireRole roles={[...FIELD_ROLES]}>
                      <DprTodayPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/field/materials"
                  element={
                    <RequireRole roles={[...FIELD_ROLES]}>
                      <MaterialsUsedPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/field/machinery"
                  element={
                    <RequireRole roles={[...FIELD_ROLES]}>
                      <MachineryUsedPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/field/workers"
                  element={
                    <RequireRole roles={[...FIELD_ROLES]}>
                      <AttendanceCheckInPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/field/measurements"
                  element={
                    <RequireRole roles={[...FIELD_ROLES]}>
                      <MeasurementEntryPage />
                    </RequireRole>
                  }
                />
                <Route path="/field/my-measurements" element={<MyMeasurementsPage />} />
                <Route path="/field/my-indents" element={<MyMaterialIndentsPage />} />

                <Route
                  path="/production-progress"
                  element={
                    <RequireRole roles={['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN']}>
                      <ProductionProgressPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/profitability"
                  element={
                    <RequireRole roles={['PROJECT_MANAGER', 'ADMIN']}>
                      <ProfitabilityPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dpr-history"
                  element={
                    <RequireRole roles={['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN']}>
                      <DprHistoryPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/dpr-monthly-report"
                  element={
                    <RequireRole roles={['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN']}>
                      <DprMonthlyReportPage />
                    </RequireRole>
                  }
                />

                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </AppLayout>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
