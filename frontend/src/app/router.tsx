import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
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

/** Branded splash shown while the session is being verified on first load */
function AppLoadingSplash() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 20,
        background: 'var(--splash-bg, #0f172a)',
      }}
    >
      {/* Logo mark */}
      <div
        style={{
          width: 64,
          height: 64,
          background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)',
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 24px rgba(22,119,255,0.45)',
          animation: 'dpr-pulse 1.8s ease-in-out infinite',
        }}
      >
        <svg width="34" height="34" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="5"  width="14" height="3" rx="1.5" fill="white" />
          <rect x="4" y="11" width="10" height="3" rx="1.5" fill="white" fillOpacity="0.85" />
          <rect x="4" y="17" width="12" height="3" rx="1.5" fill="white" fillOpacity="0.7" />
          <circle cx="21" cy="21" r="5" fill="#52c41a" />
          <path d="M18.5 21l1.8 1.8 3.2-3.2" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* App name */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.3px' }}>
          DPR System
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
          Daily Progress Reporting Platform
        </div>
      </div>

      {/* Subtle dot-pulse loader */}
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#1677ff',
              opacity: 0.7,
              animation: `dpr-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Keyframe styles injected inline */}
      <style>{`
        @keyframes dpr-pulse {
          0%, 100% { transform: scale(1);   box-shadow: 0 6px 24px rgba(22,119,255,0.45); }
          50%       { transform: scale(1.06); box-shadow: 0 8px 32px rgba(22,119,255,0.65); }
        }
        @keyframes dpr-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40%           { transform: scale(1.2); opacity: 1;   }
        }
      `}</style>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isLoading, isError } = useSession();
  const setUser = useAuthStore((state) => state.setUser);

  useEffect(() => {
    if (user) setUser(user);
  }, [user, setUser]);

  if (isLoading) return <AppLoadingSplash />;

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
