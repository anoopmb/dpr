import { Badge, Button, Dropdown, Empty, List, Typography } from 'antd';
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

dayjs.extend(relativeTime);

export function NotificationBell({ color }: { color: string }) {
  const navigate = useNavigate();
  const setSelectedProjectId = useProjectContextStore((s) => s.setSelectedProjectId);
  const { data } = useNotifications();
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
  };

  const dropdownContent = (
    <div
      style={{
        width: 360,
        maxHeight: 420,
        overflowY: 'auto',
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <Typography.Text strong>Notifications</Typography.Text>
        {unreadCount > 0 && (
          <Button type="link" size="small" onClick={() => markAllRead.mutate()}>
            Mark all read
          </Button>
        )}
      </div>
      {items.length === 0 ? (
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
                background: item.is_read ? undefined : '#f0f5ff',
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
      )}
    </div>
  );

  return (
    <Dropdown popupRender={() => dropdownContent} trigger={['click']} placement="bottomRight">
      <Button type="text" style={{ color, height: 44 }}>
        <Badge count={unreadCount} size="small">
          <BellOutlined style={{ color, fontSize: 18 }} />
        </Badge>
      </Button>
    </Dropdown>
  );
}
