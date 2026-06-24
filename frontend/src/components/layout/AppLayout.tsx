import React, { useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Button, Dropdown, Grid, Layout, Menu, Space, Typography, type MenuProps } from 'antd';
import {
  ApartmentOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  BarChartOutlined,
  CameraOutlined,
  CarOutlined,
  CheckOutlined,
  DashboardOutlined,
  DesktopOutlined,
  DollarOutlined,
  DownOutlined,
  FileTextOutlined,
  GlobalOutlined,
  IdcardOutlined,
  InboxOutlined,
  LogoutOutlined,
  MenuUnfoldOutlined,
  MobileOutlined,
  MoonFilled,
  PercentageOutlined,
  RiseOutlined,
  SettingOutlined,
  SunFilled,
  TeamOutlined,
  ToolOutlined,
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
      { key: '/settings', label: 'Organization Settings', icon: <GlobalOutlined />, roles: ['ADMIN'] },
    ],
  },
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
  const { mode: themeMode, resolvedMode, setMode: setThemeMode, palette } = useThemeMode();

  usePushSubscription(!!user);

  const { data: orgSettings } = useOrganizationSettings();
  const companyName = orgSettings?.company_name ?? 'DPR System';
  const mainLogoUrl = resolvedMode === 'dark' ? orgSettings?.company_logo_dark_url : orgSettings?.company_logo_light_url;
  const smallLogoUrl = resolvedMode === 'dark' ? orgSettings?.company_logo_small_dark_url : orgSettings?.company_logo_small_light_url;

  const isField = isFieldRole(user?.role);
  const isAdmin = user?.role === 'ADMIN';

  const menuItems = useMemo((): MenuProps['items'] => {
    if (isField) return fieldMenuItems.map((item) => ({ key: item.key, icon: item.icon, label: item.label }));

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
        children: fieldMenuItems.map((item) => ({ key: item.key, icon: item.icon, label: item.label })),
      });
    }
    return items;
  }, [isField, isAdmin, user?.role]);

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
            borderRight: `1px solid ${palette.borderColor}`,
            boxShadow: 'var(--sb-shadow)',
            position: isMobile ? 'fixed' : 'relative',
            inset: isMobile ? '0 auto 0 0' : undefined,
            height: isMobile ? '100vh' : '100%',
            zIndex: isMobile ? 1200 : undefined,
            transform: isMobile && !mobileNavOpen ? 'translateX(-100%)' : 'translateX(0)',
            transition: 'transform 0.25s ease, width 0.25s ease',
            display: 'flex',
            flexDirection: 'column',
            ['--menu-accent' as string]: palette.accent,
          } as React.CSSProperties}
        >
          <div
            style={{
              height: 64,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: desktopCollapsed ? 'center' : 'space-between',
              paddingInline: desktopCollapsed ? 0 : 16,
              overflow: 'hidden',
              borderBottom: `1px solid ${palette.borderColor}`,
            }}
          >
            {desktopCollapsed ? (
              smallLogoUrl ? (
                <img src={smallLogoUrl} alt={companyName} style={{ height: 32, maxWidth: 32, objectFit: 'contain' }} />
              ) : (
                <Typography.Title level={5} style={{ margin: 0, color: palette.headerText }}>DPR</Typography.Title>
              )
            ) : mainLogoUrl ? (
              <img src={mainLogoUrl} alt={companyName} style={{ height: 32, maxWidth: SIDER_WIDTH - 80, objectFit: 'contain' }} />
            ) : (
              <Typography.Title level={4} style={{ margin: 0, color: palette.headerText, whiteSpace: 'nowrap' }}>
                {companyName}
              </Typography.Title>
            )}
            {!isMobile && !desktopCollapsed && (
              <Button
                type="text"
                shape="circle"
                size="small"
                icon={<ArrowLeftOutlined style={{ fontSize: 13 }} />}
                onClick={() => setDesktopCollapsedState(true)}
                style={{ color: palette.headerMutedText, flexShrink: 0 }}
              />
            )}
          </div>
          {!isMobile && desktopCollapsed && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0', borderBottom: `1px solid ${palette.borderColor}` }}>
              <Button
                type="text"
                shape="circle"
                size="small"
                icon={<ArrowRightOutlined style={{ fontSize: 13 }} />}
                onClick={() => setDesktopCollapsedState(false)}
                style={{ color: palette.headerMutedText }}
              />
            </div>
          )}
          <Menu
            className="sidebar-nav"
            theme={resolvedMode === 'dark' ? 'dark' : 'light'}
            mode="inline"
            inlineCollapsed={desktopCollapsed}
            selectedKeys={selectedKey}
            openKeys={desktopCollapsed ? [] : openKeys}
            onOpenChange={handleOpenChange}
            items={menuItems}
            style={{ background: 'transparent', borderInlineEnd: 'none', paddingTop: 8, flex: 1, overflowY: 'auto', overflowX: 'hidden' }}
            onClick={({ key }) => {
              navigate(key);
              if (isMobile) setMobileNavOpenState(false);
            }}
          />
          <Dropdown
            menu={{ items: profileMenuItems, onClick: handleProfileMenuClick }}
            trigger={['click']}
            placement={desktopCollapsed ? 'right' : 'topRight'}
          >
            <div
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: desktopCollapsed ? 'center' : 'space-between',
                gap: 8,
                padding: desktopCollapsed ? '12px 0' : '12px 16px',
                borderTop: `1px solid ${palette.borderColor}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Avatar size={32} icon={<UserOutlined />} style={{ backgroundColor: palette.accent, flexShrink: 0 }} />
                {!desktopCollapsed && (
                  <div style={{ minWidth: 0, lineHeight: 1.3 }}>
                    <div style={{ color: palette.headerText, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user?.fullName ?? 'Guest'}
                    </div>
                    <div style={{ color: palette.headerMutedText, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user?.email ?? ''}
                    </div>
                  </div>
                )}
              </div>
              {!desktopCollapsed && <DownOutlined style={{ fontSize: 11, color: palette.headerMutedText, flexShrink: 0 }} />}
            </div>
          </Dropdown>
        </Sider>
        <Layout style={{ minWidth: 0 }}>
          <InstallBanner />
          <Header
            style={{
              paddingInline: 16,
              background: palette.headerBackground,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: 64,
              borderBottom: `1px solid ${palette.borderColor}`,
            }}
          >
            {isMobile ? (
              <Button
                type="text"
                icon={<MenuUnfoldOutlined style={{ fontSize: 18 }} />}
                onClick={() => setMobileNavOpenState((prev) => !prev)}
                style={{ color: palette.headerText, minWidth: 44, minHeight: 44 }}
              >
                {isField ? 'Field Entry' : isAdmin ? 'Admin' : 'Menu'}
              </Button>
            ) : (
              <span />
            )}
            <Space>
              <NotificationBell color={palette.headerText} />
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
