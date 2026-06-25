import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthStore } from '@/store/auth-store';
import { useSession } from '@/api/hooks/useSession';
import { useOrganizationBranding } from '@/api/hooks/useOrganizationSettings';
import { RequireRole } from '@/app/RequireRole';
import { LoginPage } from '@/features/auth/LoginPage';

// ── Lazy page imports — each becomes a separate chunk ────────────────────────
const DashboardPage         = lazy(() => import('@/features/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })));
const AnalyticsPage         = lazy(() => import('@/features/dashboard/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const ProjectsListPage      = lazy(() => import('@/features/projects/ProjectsListPage').then(m => ({ default: m.ProjectsListPage })));
const BoqPage               = lazy(() => import('@/features/boq/BoqPage').then(m => ({ default: m.BoqPage })));
const MeasurementsPage      = lazy(() => import('@/features/measurements/MeasurementsPage').then(m => ({ default: m.MeasurementsPage })));
const MaterialIndentsPage   = lazy(() => import('@/features/material/MaterialIndentsPage').then(m => ({ default: m.MaterialIndentsPage })));
const WorkersPage           = lazy(() => import('@/features/workers/WorkersPage').then(m => ({ default: m.WorkersPage })));
const BillingPage           = lazy(() => import('@/features/billing/BillingPage').then(m => ({ default: m.BillingPage })));
const ExpensesPage          = lazy(() => import('@/features/expenses/ExpensesPage').then(m => ({ default: m.ExpensesPage })));
const MastersPage           = lazy(() => import('@/features/masters/MastersPage').then(m => ({ default: m.MastersPage })));
const SettingsPage          = lazy(() => import('@/features/settings/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ApprovalWorkflowPage  = lazy(() => import('@/features/settings/ApprovalWorkflowPage').then(m => ({ default: m.ApprovalWorkflowPage })));
const UsersPage             = lazy(() => import('@/features/users/UsersPage').then(m => ({ default: m.UsersPage })));
const AuditLogPage          = lazy(() => import('@/features/admin/AuditLogPage').then(m => ({ default: m.AuditLogPage })));
const ProfilePage           = lazy(() => import('@/features/profile/ProfilePage').then(m => ({ default: m.ProfilePage })));
const DprTodayPage          = lazy(() => import('@/features/field/DprTodayPage').then(m => ({ default: m.DprTodayPage })));
const MaterialsUsedPage     = lazy(() => import('@/features/field/MaterialsUsedPage').then(m => ({ default: m.MaterialsUsedPage })));
const MachineryUsedPage     = lazy(() => import('@/features/field/MachineryUsedPage').then(m => ({ default: m.MachineryUsedPage })));
const AttendanceCheckInPage = lazy(() => import('@/features/field/AttendanceCheckInPage').then(m => ({ default: m.AttendanceCheckInPage })));
const MeasurementEntryPage  = lazy(() => import('@/features/field/MeasurementEntryPage').then(m => ({ default: m.MeasurementEntryPage })));
const MyMeasurementsPage    = lazy(() => import('@/features/field/MyMeasurementsPage').then(m => ({ default: m.MyMeasurementsPage })));
const MyMaterialIndentsPage = lazy(() => import('@/features/field/MyMaterialIndentsPage').then(m => ({ default: m.MyMaterialIndentsPage })));
const ProductionProgressPage= lazy(() => import('@/features/dpr/ProductionProgressPage').then(m => ({ default: m.ProductionProgressPage })));
const ProfitabilityPage     = lazy(() => import('@/features/dpr/ProfitabilityPage').then(m => ({ default: m.ProfitabilityPage })));
const DprHistoryPage        = lazy(() => import('@/features/dpr/DprHistoryPage').then(m => ({ default: m.DprHistoryPage })));
const DprMonthlyReportPage  = lazy(() => import('@/features/dpr/DprMonthlyReportPage').then(m => ({ default: m.DprMonthlyReportPage })));
const WorkerEarningsPage    = lazy(() => import('@/features/reports/WorkerEarningsPage').then(m => ({ default: m.WorkerEarningsPage })));
const DailyLabourLogPage    = lazy(() => import('@/features/reports/DailyLabourLogPage').then(m => ({ default: m.DailyLabourLogPage })));

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

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.3px' }}>
          DPR System
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
          Daily Progress Reporting Platform
        </div>
      </div>

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

/** Applies the org's favicon to the browser tab. Runs regardless of auth
 * state (mounted at the top of AppRouter) since the login page also needs
 * the right icon before any session exists. */
function FaviconSync() {
  const { data: branding } = useOrganizationBranding();

  useEffect(() => {
    if (!branding?.favicon_url) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = branding.favicon_url;
  }, [branding?.favicon_url]);

  return null;
}

export function AppRouter() {
  return (
    <>
      <FaviconSync />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
          <RequireAuth>
            <AppLayout>
              <Suspense fallback={<AppLoadingSplash />}>
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
                    path="/audit-logs"
                    element={
                      <RequireRole roles={['ADMIN']}>
                        <AuditLogPage />
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
                    path="/daily-labour-log"
                    element={
                      <RequireRole roles={['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN']}>
                        <DailyLabourLogPage />
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
                    path="/settings/approval-workflow"
                    element={
                      <RequireRole roles={['ADMIN']}>
                        <ApprovalWorkflowPage />
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
              </Suspense>
            </AppLayout>
          </RequireAuth>
          }
        />
      </Routes>
    </>
  );
}
