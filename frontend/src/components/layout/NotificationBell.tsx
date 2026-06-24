import { useState } from 'react';
import { Badge, Button, Drawer, Dropdown, Empty, List, Skeleton, Typography, theme } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type NotificationRead,
} from '@/api/hooks/useNotifications';
import { useProjectContextStore } from '@/store/project-context-store';
import { useIsMobile } from '@/hooks/useIsMobile';

dayjs.extend(relativeTime);

export function NotificationBell({ color }: { color: string }) {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const setSelectedProjectId = useProjectContextStore((s) => s.setSelectedProjectId);
  const { data, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = data?.items ?? [];
  const unreadCount = data?.unread_count ?? 0;

  const handleClick = (notification: NotificationRead) => {
    if (!notification.is_read) {
      markRead.mutate(notification.id);
    }
    if (notification.project_id) {
      setSelectedProjectId(notification.project_id);
    }
    if (notification.link_url) {
      navigate(notification.link_url);
    }
    if (isMobile) setMobileOpen(false);
  };

  const listContent = isLoading ? (
    <Skeleton active paragraph={{ rows: 3 }} style={{ padding: 14 }} />
  ) : items.length === 0 ? (
    <Empty description="No notifications" style={{ padding: 24 }} />
  ) : (
    <List
      dataSource={items}
      renderItem={(item) => (
        <List.Item
          onClick={() => handleClick(item)}
          style={{
            padding: '10px 14px',
            cursor: 'pointer',
            background: item.is_read ? undefined : token.colorPrimaryBg,
          }}
        >
          <div style={{ width: '100%' }}>
            <Typography.Text strong={!item.is_read}>{item.title}</Typography.Text>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {item.message}
              </Typography.Text>
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {dayjs(item.created_at).fromNow()}
            </Typography.Text>
          </div>
        </List.Item>
      )}
    />
  );

  const bellButton = (
    <Button
      type="text"
      style={{ color, height: 44 }}
      onClick={isMobile ? () => setMobileOpen(true) : undefined}
    >
      <Badge count={unreadCount} size="small">
        <BellOutlined style={{ color, fontSize: 18 }} />
      </Badge>
    </Button>
  );

  if (isMobile) {
    return (
      <>
        {bellButton}
        <Drawer
          title="Notifications"
          placement="top"
          height="80vh"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          zIndex={1300}
          styles={{ body: { padding: 0 } }}
          extra={
            unreadCount > 0 && (
              <Button type="link" size="small" onClick={() => markAllRead.mutate()}>
                Mark all read
              </Button>
            )
          }
        >
          {listContent}
        </Drawer>
      </>
    );
  }

  const dropdownContent = (
    <div
      style={{
        width: 360,
        maxHeight: 420,
        overflowY: 'auto',
        background: token.colorBgElevated,
        borderRadius: token.borderRadiusLG,
        boxShadow: token.boxShadowSecondary,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Typography.Text strong>Notifications</Typography.Text>
        {unreadCount > 0 && (
          <Button type="link" size="small" onClick={() => markAllRead.mutate()}>
            Mark all read
          </Button>
        )}
      </div>
      {listContent}
    </div>
  );

  return (
    <Dropdown popupRender={() => dropdownContent} trigger={['click']} placement="bottomRight">
      {bellButton}
    </Dropdown>
  );
}
