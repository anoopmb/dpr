import React, { useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Button, Dropdown, Grid, Layout, Menu, Space, Typography, type MenuProps } from 'antd';
import {
  ApartmentOutlined,
  BarChartOutlined,
  CameraOutlined,
  CarOutlined,
  CheckOutlined,
  DashboardOutlined,
  DesktopOutlined,
  DollarOutlined,
  FileTextOutlined,
  GlobalOutlined,
  IdcardOutlined,
  InboxOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MobileOutlined,
  MoonFilled,
  PercentageOutlined,
  RiseOutlined,
  SettingOutlined,
  SunFilled,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { apiClient } from '@/api/client';
import { useAuthStore, isFieldRole, type UserRole } from '@/store/auth-store';
import { useThemeMode, type ThemeMode } from '@/theme/theme-context';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { InstallBanner } from '@/components/layout/InstallBanner';
import { usePushSubscription } from '@/api/hooks/usePushSubscription';
import { useOrganizationSettings } from '@/api/hooks/useOrganizationSettings';

const { Sider, Header, Content } = Layout;
const { useBreakpoint } = Grid;

const SIDER_WIDTH = 220;

const ROLE_LABELS: Record<UserRole, string> = {
  SITE_ENGINEER: 'Site Engineer',
  PROJECT_MANAGER: 'Project Manager',
  QUANTITY_SURVEYOR: 'Quantity Surveyor',
  STORE_KEEPER: 'Store Keeper',
  ADMIN: 'Administrator',
};

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  roles: UserRole[] | null;
}

// Flat single-level list — no expandable groups. Order is preserved as
// rendered, role-filtered per item.
const desktopNavItems: NavItem[] = [
  { key: '/dashboard', label: 'Dashboard', icon: <DashboardOutlined />, roles: null },
  { key: '/projects', label: 'Projects', icon: <ApartmentOutlined />, roles: ['PROJECT_MANAGER', 'ADMIN'] },
  { key: '/boq', label: 'BOQ', icon: <FileTextOutlined />, roles: ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN'] },
  { key: '/measurements', label: 'Measurements (MB)', icon: <FileTextOutlined />, roles: ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN'] },
  { key: '/dpr-history', label: 'DPR History', icon: <FileTextOutlined />, roles: ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN'] },
  { key: '/dpr-monthly-report', label: 'Monthly DPR Report', icon: <FileTextOutlined />, roles: ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN'] },
  { key: '/material-indents', label: 'Material Indents', icon: <InboxOutlined />, roles: ['PROJECT_MANAGER', 'STORE_KEEPER', 'ADMIN'] },
  { key: '/workers', label: 'Workers & Attendance', icon: <TeamOutlined />, roles: ['PROJECT_MANAGER', 'ADMIN'] },
  { key: '/expenses', label: 'Expenses', icon: <CarOutlined />, roles: ['PROJECT_MANAGER', 'STORE_KEEPER', 'ADMIN'] },
  { key: '/billing', label: 'Running Bills', icon: <DollarOutlined />, roles: ['QUANTITY_SURVEYOR', 'PROJECT_MANAGER', 'ADMIN'] },
  { key: '/production-progress', label: 'Production Progress', icon: <RiseOutlined />, roles: ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN'] },
  { key: '/profitability', label: 'Profitability', icon: <PercentageOutlined />, roles: ['PROJECT_MANAGER', 'ADMIN'] },
  { key: '/analytics', label: 'Analytics', icon: <BarChartOutlined />, roles: ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN'] },
  { key: '/worker-earnings', label: 'Worker Earnings', icon: <TeamOutlined />, roles: ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN'] },
  { key: '/daily-labour-log', label: 'Daily Labour Log', icon: <TeamOutlined />, roles: ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN'] },
  { key: '/masters', label: 'Master Data', icon: <SettingOutlined />, roles: ['ADMIN'] },
  { key: '/users', label: 'Users', icon: <IdcardOutlined />, roles: ['ADMIN'] },
  { key: '/settings', label: 'Organization Settings', icon: <GlobalOutlined />, roles: ['ADMIN'] },
];

const fieldMenuItems = [
  { key: '/field/dpr-today', label: "Today's DPR", icon: <DashboardOutlined /> },
  { key: '/field/materials', label: 'Materials Used', icon: <FileTextOutlined /> },
  { key: '/field/machinery', label: 'Machinery Used', icon: <CarOutlined /> },
  { key: '/field/workers', label: 'Attendance', icon: <TeamOutlined /> },
  { key: '/field/measurements', label: 'Measurements', icon: <CameraOutlined /> },
  { key: '/field/my-measurements', label: 'My Measurements', icon: <FileTextOutlined /> },
  { key: '/field/my-indents', label: 'My Material Indents', icon: <InboxOutlined /> },
] as const;

// Admin sees the field-entry screens too, appended after the desktop items —
// still one flat list, no group wrapper, matching the reference's simplicity.
const adminFieldNavItems: NavItem[] = fieldMenuItems.map((item) => ({
  key: item.key,
  label: item.label,
  icon: <MobileOutlined />,
  roles: ['ADMIN'],
}));

export function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const isMobile = screens.lg === false;
  // Independent per-breakpoint state instead of one "collapsed" flag kept
  // in sync via an effect — each toggle only ever touches the state that's
  // relevant to the current breakpoint, so there's nothing to synchronize.
  const [mobileNavOpenState, setMobileNavOpenState] = useState(false);
  const [desktopCollapsedState, setDesktopCollapsedState] = useState(false);

  const user = useAuthStore((state) => state.user);
  const clearUser = useAuthStore((state) => state.clearUser);
  const { mode: themeMode, resolvedMode, setMode: setThemeMode, toggleMode, palette } = useThemeMode();

  usePushSubscription(!!user);

  const { data: orgSettings } = useOrganizationSettings();
  const companyName = orgSettings?.company_name ?? 'DPR System';
  const mainLogoUrl = resolvedMode === 'dark' ? orgSettings?.company_logo_dark_url : orgSettings?.company_logo_light_url;
  const smallLogoUrl = resolvedMode === 'dark' ? orgSettings?.company_logo_small_dark_url : orgSettings?.company_logo_small_light_url;

  const isField = isFieldRole(user?.role);
  const isAdmin = user?.role === 'ADMIN';

  const visibleNavItems = useMemo((): NavItem[] => {
    if (isField) return fieldMenuItems.map((item) => ({ key: item.key, label: item.label, icon: item.icon, roles: null }));
    const all = isAdmin ? [...desktopNavItems, ...adminFieldNavItems] : desktopNavItems;
    return all.filter((item) => !item.roles || item.roles.includes(user?.role as UserRole));
  }, [isField, isAdmin, user?.role]);

  const menuItems = useMemo((): MenuProps['items'] =>
    visibleNavItems.map((item) => ({ key: item.key, icon: item.icon, label: item.label })),
  [visibleNavItems]);

  const selectedKey = useMemo(() => {
    const match = visibleNavItems.find((item) => location.pathname.startsWith(item.key));
    return match ? [match.key] : [visibleNavItems[0]?.key].filter(Boolean) as string[];
  }, [visibleNavItems, location.pathname]);

  const handleLogout = () => {
    apiClient.post('/auth/logout').catch(() => undefined).finally(() => {
      clearUser();
      navigate('/login', { replace: true });
    });
  };

  const buildThemeLabel = (label: string, target: ThemeMode) => {
    const isActive = target === 'system' ? themeMode === 'system' : themeMode === target;
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', minWidth: 140 }}>
        <span>{label}</span>
        {isActive ? <CheckOutlined style={{ color: palette.accent }} /> : null}
      </div>
    );
  };

  const profileMenuItems: MenuProps['items'] = [
    { key: 'my-profile', icon: <UserOutlined />, label: 'My Profile' },
    { type: 'divider' },
    {
      key: 'theme-group',
      type: 'group',
      label: <span style={{ color: palette.contentMutedText, fontSize: 12 }}>Theme</span>,
      children: [
        { key: 'theme:light', icon: <SunFilled />, label: buildThemeLabel('Light', 'light') },
        { key: 'theme:dark', icon: <MoonFilled />, label: buildThemeLabel('Dark', 'dark') },
        { key: 'theme:system', icon: <DesktopOutlined />, label: buildThemeLabel('System', 'system') },
      ],
    },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Sign out' },
  ];

  const handleProfileMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key.startsWith('theme:')) {
      setThemeMode(key.replace('theme:', '') as ThemeMode);
      return;
    }
    if (key === 'logout') {
      handleLogout();
      return;
    }
    if (key === 'my-profile') {
      navigate('/profile');
    }
  };

  const desktopCollapsed = !isMobile && desktopCollapsedState;
  const mobileNavOpen = isMobile && mobileNavOpenState;

  const roleLabel = user?.role ? ROLE_LABELS[user.role] : '';

  const profileTrigger = (
    <Dropdown
      menu={{ items: profileMenuItems, onClick: handleProfileMenuClick }}
      trigger={['click']}
      placement="bottomRight"
      // antd's default dropdown popup z-index (1050) sits below our mobile
      // nav backdrop (1100) and the Sider itself (1200), so on mobile the
      // popup rendered but was visually/interactively covered by the
      // backdrop — taps just closed the drawer instead of hitting a menu
      // item. Push the popup above both.
      styles={{ root: { zIndex: 1300 } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <Avatar size={36} icon={<UserOutlined />} style={{ backgroundColor: '#1f2937', flexShrink: 0 }} />
        {!isMobile && (
          <div style={{ minWidth: 0, lineHeight: 1.3, textAlign: 'right' }}>
            <div style={{ color: palette.headerText, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {user?.fullName ?? 'Guest'}
            </div>
            <div style={{ color: palette.headerMutedText, fontSize: 12, whiteSpace: 'nowrap' }}>
              {user?.email ?? ''}
            </div>
            <div style={{ color: palette.headerMutedText, fontSize: 11, whiteSpace: 'nowrap' }}>
              {roleLabel}
            </div>
          </div>
        )}
      </div>
    </Dropdown>
  );

  return (
    <>
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpenState(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 1100 }}
          aria-hidden
        />
      )}
      <Layout style={{ minHeight: '100vh', background: palette.layoutBackground }}>
        <Sider
          collapsible={!isMobile}
          collapsed={desktopCollapsed}
          collapsedWidth={isMobile ? 0 : 64}
          trigger={null}
          width={SIDER_WIDTH}
          onCollapse={(value) => {
            if (!isMobile) setDesktopCollapsedState(value);
          }}
          style={{
            backgroundColor: palette.siderBackground,
            boxShadow: 'var(--sb-shadow)',
            // Standard antd "Fixed Sider" pattern: pinned to the viewport at
            // its own height, independent of how tall the page content is.
            position: 'fixed',
            insetInlineStart: 0,
            top: 0,
            height: '100vh',
            zIndex: isMobile ? 1200 : 100,
            transform: isMobile && !mobileNavOpen ? 'translateX(-100%)' : 'translateX(0)',
            transition: 'transform 0.25s ease, width 0.25s ease',
          }}
        >
          {/* antd's <Sider> wraps `children` in its own internal
              .ant-layout-sider-children div, which is NOT a flex container —
              so flex:1 on the Menu below does nothing unless WE provide the
              flex column ourselves, one level in. */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div
              style={{
                height: 64,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: desktopCollapsed ? 'center' : 'flex-start',
                paddingInline: desktopCollapsed ? 0 : 20,
                overflow: 'hidden',
              }}
            >
              {desktopCollapsed ? (
                smallLogoUrl ? (
                  <img src={smallLogoUrl} alt={companyName} style={{ height: 30, maxWidth: 30, objectFit: 'contain' }} />
                ) : (
                  <Typography.Title level={5} style={{ margin: 0, color: palette.headerText }}>DPR</Typography.Title>
                )
              ) : mainLogoUrl ? (
                <img src={mainLogoUrl} alt={companyName} style={{ height: 28, maxWidth: SIDER_WIDTH - 40, objectFit: 'contain' }} />
              ) : (
                <Typography.Title level={4} style={{ margin: 0, color: palette.headerText, whiteSpace: 'nowrap' }}>
                  {companyName}
                </Typography.Title>
              )}
            </div>
            <Menu
              className="sidebar-nav"
              mode="inline"
              inlineCollapsed={desktopCollapsed}
              selectedKeys={selectedKey}
              items={menuItems}
              style={{ background: 'transparent', borderInlineEnd: 'none', paddingTop: 4, flex: 1, overflowY: 'auto', overflowX: 'hidden' }}
              onClick={({ key }) => {
                navigate(key);
                if (isMobile) setMobileNavOpenState(false);
              }}
            />
            {!isMobile && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0', flexShrink: 0 }}>
                <Button
                  type="text"
                  shape="circle"
                  size="small"
                  icon={desktopCollapsed
                    ? <MenuUnfoldOutlined style={{ fontSize: 14 }} />
                    : <MenuFoldOutlined style={{ fontSize: 14 }} />
                  }
                  onClick={() => setDesktopCollapsedState((prev) => !prev)}
                  style={{ color: palette.headerMutedText }}
                />
              </div>
            )}
          </div>
        </Sider>
        <Layout
          style={{
            minWidth: 0,
            marginInlineStart: isMobile ? 0 : desktopCollapsed ? 64 : SIDER_WIDTH,
            transition: 'margin-inline-start 0.2s ease',
          }}
        >
          <InstallBanner />
          <Header
            style={{
              paddingInline: 24,
              paddingBlock: 12,
              background: palette.headerBackground,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: 'auto',
              minHeight: 72,
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {isMobile && (
                <Button
                  type="text"
                  icon={<MenuUnfoldOutlined style={{ fontSize: 18 }} />}
                  onClick={() => setMobileNavOpenState((prev) => !prev)}
                  style={{ color: palette.headerText, minWidth: 44, minHeight: 44, flexShrink: 0 }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <Typography.Title level={4} style={{ margin: 0, color: palette.headerText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {companyName}
                </Typography.Title>
                {!isMobile && (
                  <Typography.Text style={{ color: palette.headerMutedText, fontSize: 13 }}>
                    Daily Progress Reporting Platform
                  </Typography.Text>
                )}
              </div>
            </div>
            <Space size={16}>
              <NotificationBell color={palette.headerText} />
              <Button
                type="text"
                shape="circle"
                icon={resolvedMode === 'dark' ? <SunFilled style={{ fontSize: 17 }} /> : <MoonFilled style={{ fontSize: 17 }} />}
                onClick={toggleMode}
                style={{ color: palette.headerText }}
              />
              {profileTrigger}
            </Space>
          </Header>
          <Content style={{ padding: isMobile ? 8 : 16, background: palette.layoutBackground, display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                flex: 1,
                background: palette.contentBackground,
                borderRadius: isMobile ? 0 : 8,
                padding: isMobile ? 12 : 24,
                border: `1px solid ${palette.borderColor}`,
                color: palette.contentText,
              }}
            >
              {children}
            </div>
          </Content>
        </Layout>
      </Layout>
    </>
  );
}
