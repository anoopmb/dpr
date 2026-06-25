import React, { useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Button, Dropdown, Layout, Menu, Space, Typography, type MenuProps } from 'antd';
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
  HistoryOutlined,
  IdcardOutlined,
  InboxOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MobileOutlined,
  MoonFilled,
  PercentageOutlined,
  QuestionCircleOutlined,
  RiseOutlined,
  SettingOutlined,
  SunFilled,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { apiClient } from '@/api/client';
import { useAuthStore, isFieldRole, type UserRole } from '@/store/auth-store';
import { ROLE_LABELS } from '@/utils/roles';
import { useThemeMode, type ThemeMode } from '@/theme/theme-context';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { usePushSubscription } from '@/api/hooks/usePushSubscription';
import { useOrganizationSettings } from '@/api/hooks/useOrganizationSettings';
import { useIsMobile } from '@/hooks/useIsMobile';

const { Sider, Header, Content } = Layout;

const SIDER_WIDTH = 220;
const HEADER_HEIGHT = 50;

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  roles: UserRole[] | null;
}

interface NavGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  children: NavItem[];
}

const dashboardNavItem: NavItem = { key: '/dashboard', label: 'Dashboard', icon: <DashboardOutlined />, roles: null };

const desktopMenuGroups: NavGroup[] = [
  {
    key: 'grp-project',
    label: 'Project',
    icon: <ApartmentOutlined />,
    children: [
      { key: '/projects', label: 'Projects', icon: <ApartmentOutlined />, roles: ['PROJECT_MANAGER', 'ADMIN'] },
      { key: '/boq', label: 'BOQ', icon: <FileTextOutlined />, roles: ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN'] },
      { key: '/measurements', label: 'Measurements (MB)', icon: <FileTextOutlined />, roles: ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN'] },
      { key: '/dpr-history', label: 'DPR History', icon: <FileTextOutlined />, roles: ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN'] },
      { key: '/dpr-monthly-report', label: 'Monthly DPR Report', icon: <FileTextOutlined />, roles: ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN'] },
    ],
  },
  {
    key: 'grp-resources',
    label: 'Resources',
    icon: <ToolOutlined />,
    children: [
      { key: '/material-indents', label: 'Material Indents', icon: <InboxOutlined />, roles: ['PROJECT_MANAGER', 'STORE_KEEPER', 'ADMIN'] },
      { key: '/workers', label: 'Workers & Attendance', icon: <TeamOutlined />, roles: ['PROJECT_MANAGER', 'ADMIN'] },
      { key: '/expenses', label: 'Expenses', icon: <CarOutlined />, roles: ['PROJECT_MANAGER', 'STORE_KEEPER', 'ADMIN'] },
    ],
  },
  {
    key: 'grp-finance',
    label: 'Finance',
    icon: <DollarOutlined />,
    children: [
      { key: '/billing', label: 'Running Bills', icon: <DollarOutlined />, roles: ['QUANTITY_SURVEYOR', 'PROJECT_MANAGER', 'ADMIN'] },
    ],
  },
  {
    key: 'grp-reports',
    label: 'Reports',
    icon: <BarChartOutlined />,
    children: [
      { key: '/production-progress', label: 'Production Progress', icon: <RiseOutlined />, roles: ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN'] },
      { key: '/profitability', label: 'Profitability', icon: <PercentageOutlined />, roles: ['PROJECT_MANAGER', 'ADMIN'] },
      { key: '/analytics', label: 'Analytics', icon: <BarChartOutlined />, roles: ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN'] },
      { key: '/worker-earnings', label: 'Worker Earnings', icon: <TeamOutlined />, roles: ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN'] },
      { key: '/daily-labour-log', label: 'Daily Labour Log', icon: <TeamOutlined />, roles: ['PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ADMIN'] },
    ],
  },
  {
    key: 'grp-admin',
    label: 'Administration',
    icon: <SettingOutlined />,
    children: [
      { key: '/masters', label: 'Master Data', icon: <SettingOutlined />, roles: ['ADMIN'] },
      { key: '/users', label: 'Users', icon: <IdcardOutlined />, roles: ['ADMIN'] },
      { key: '/settings', label: 'Settings', icon: <GlobalOutlined />, roles: ['ADMIN'] },
      { key: '/settings/approval-workflow', label: 'Approval Workflow', icon: <CheckOutlined />, roles: ['ADMIN'] },
      { key: '/audit-logs', label: 'Audit Logs', icon: <HistoryOutlined />, roles: ['ADMIN'] },
    ],
  },
];

const fieldMenuItems = [
  { key: '/field/dpr-today', label: "Today's DPR", icon: <DashboardOutlined /> },
  { key: '/field/materials', label: 'Materials Used', icon: <FileTextOutlined /> },
  { key: '/field/machinery', label: 'Machinery Used', icon: <CarOutlined /> },
  { key: '/field/workers', label: 'Attendance', icon: <TeamOutlined /> },
  { key: '/field/measurements', label: 'Measurements', icon: <CameraOutlined /> },
  { key: '/field/my-indents', label: 'My Material Indents', icon: <InboxOutlined /> },
] as const;

// On desktop, Today's DPR already consolidates Materials/Machinery/Attendance/
// Measurements into tabs, so the standalone pages are redundant there — only
// keep them in the menu on mobile, where they act as quick-access shortcuts.
const DESKTOP_ALWAYS_VISIBLE_FIELD_KEY = '/field/dpr-today';

export function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
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

  const visibleFieldMenuItems = useMemo(
    () => (isMobile ? fieldMenuItems : fieldMenuItems.filter((item) => item.key === DESKTOP_ALWAYS_VISIBLE_FIELD_KEY)),
    [isMobile],
  );

  const menuItems = useMemo((): MenuProps['items'] => {
    if (isField) return visibleFieldMenuItems.map((item) => ({ key: item.key, icon: item.icon, label: item.label }));

    const items: MenuProps['items'] = [
      { key: dashboardNavItem.key, icon: dashboardNavItem.icon, label: dashboardNavItem.label },
    ];
    for (const group of desktopMenuGroups) {
      const visible = group.children.filter(
        (item) => !item.roles || item.roles.includes(user?.role as UserRole),
      );
      if (visible.length === 0) continue;
      items.push({
        key: group.key,
        icon: group.icon,
        label: group.label,
        children: visible.map((item) => ({ key: item.key, icon: item.icon, label: item.label })),
      });
    }
    if (isAdmin) {
      items.push({
        key: 'grp-field',
        icon: <MobileOutlined />,
        label: 'Field Access',
        children: visibleFieldMenuItems.map((item) => ({ key: item.key, icon: item.icon, label: item.label })),
      });
    }
    return items;
  }, [isField, isAdmin, user?.role, visibleFieldMenuItems]);

  const allNavKeys = useMemo(() => {
    if (isField) return fieldMenuItems.map((item) => item.key as string);
    const keys: string[] = [dashboardNavItem.key];
    for (const group of desktopMenuGroups) {
      for (const item of group.children) {
        if (!item.roles || item.roles.includes(user?.role as UserRole)) keys.push(item.key);
      }
    }
    if (isAdmin) fieldMenuItems.forEach((item) => keys.push(item.key));
    return keys;
  }, [isField, isAdmin, user?.role]);

  const [openKeys, setOpenKeys] = useState<string[]>(() => {
    if (isField) return [];
    for (const group of desktopMenuGroups) {
      if (group.children.some((item) => location.pathname.startsWith(item.key))) return [group.key];
    }
    if (isAdmin && fieldMenuItems.some((item) => location.pathname.startsWith(item.key))) return ['grp-field'];
    return [];
  });

  const handleOpenChange = (keys: string[]) => {
    const latestKey = keys.find((k) => !openKeys.includes(k));
    setOpenKeys(latestKey ? [latestKey] : []);
  };

  const selectedKey = useMemo(() => {
    const match = allNavKeys.find((k) => location.pathname.startsWith(k));
    return match ? [match] : [allNavKeys[0]];
  }, [allNavKeys, location.pathname]);

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
    { key: 'support-centre', icon: <QuestionCircleOutlined />, label: 'Support Centre' },
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
    if (key === 'support-centre') {
      window.open('/support-centre.html', '_blank', 'noopener,noreferrer');
    }
  };

  const desktopCollapsed = !isMobile && desktopCollapsedState;
  const mobileNavOpen = isMobile && mobileNavOpenState;

  // Collapsing the rail and the popout-on-hover submenu share the same
  // `openKeys` state in rc-menu. Clear it whenever the rail is toggled (see
  // the onClick handler below) so a group left expanded from inline mode
  // doesn't immediately reappear as an already-open popup — it should only
  // open once the user actually hovers or clicks its icon.
  const toggleDesktopCollapsed = () => {
    setDesktopCollapsedState((prev) => !prev);
    setOpenKeys([]);
  };

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <Avatar size={28} icon={<UserOutlined />} style={{ backgroundColor: '#1f2937', flexShrink: 0 }} />
        {!isMobile && (
          <div style={{ minWidth: 0, lineHeight: 1.25, textAlign: 'right' }}>
            <div style={{ color: palette.headerText, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {user?.fullName ?? 'Guest'}
            </div>
            <div style={{ color: palette.headerMutedText, fontSize: 10, whiteSpace: 'nowrap' }}>
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
            if (!isMobile && value !== desktopCollapsedState) toggleDesktopCollapsed();
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
                height: 56,
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
              openKeys={openKeys}
              onOpenChange={handleOpenChange}
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
                  onClick={toggleDesktopCollapsed}
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
          <Header
            style={{
              paddingInline: 16,
              background: palette.headerBackground,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: HEADER_HEIGHT,
              lineHeight: `${HEADER_HEIGHT}px`,
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {isMobile && (
                <Button
                  type="text"
                  icon={<MenuUnfoldOutlined style={{ fontSize: 16 }} />}
                  onClick={() => setMobileNavOpenState((prev) => !prev)}
                  style={{ color: palette.headerText, width: HEADER_HEIGHT, height: HEADER_HEIGHT, flexShrink: 0 }}
                />
              )}
              <Typography.Text
                strong
                style={{ color: palette.headerText, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {companyName}
              </Typography.Text>
            </div>
            <Space size={12}>
              <NotificationBell color={palette.headerText} />
              <Button
                type="text"
                shape="circle"
                size="small"
                icon={resolvedMode === 'dark' ? <SunFilled style={{ fontSize: 15 }} /> : <MoonFilled style={{ fontSize: 15 }} />}
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
