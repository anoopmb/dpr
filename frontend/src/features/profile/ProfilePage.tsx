import { useState } from 'react';
import { Avatar, Button, Card, Empty, Form, Input, List, Tabs, Tag, Typography, message } from 'antd';
import { IdcardOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, type UserRole } from '@/store/auth-store';
import { useUpdateMyProfile, useChangeMyPassword } from '@/api/hooks/useUsers';
import { useMyActivity } from '@/api/hooks/useActivity';
import { useDateFormat } from '@/utils/format';
import { useUploadPhoto } from '@/api/hooks/useUpload';
import { PhotoCapture } from '@/components/common/PhotoCapture';
import { useProjectContextStore } from '@/store/project-context-store';
import { useIsMobile } from '@/hooks/useIsMobile';
import { ROLE_LABELS } from '@/utils/roles';

const ROLE_TAG_COLOR: Record<UserRole, string> = {
  SITE_ENGINEER: 'blue',
  PROJECT_MANAGER: 'purple',
  QUANTITY_SURVEYOR: 'gold',
  STORE_KEEPER: 'cyan',
  ADMIN: 'red',
};

interface ProfileFormValues {
  full_name: string;
}

interface PasswordFormValues {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

function ProfileHero() {
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();
  if (!user) return null;

  return (
    <Card style={{ borderRadius: 14, marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: 'center',
          textAlign: isMobile ? 'center' : 'left',
          gap: 20,
        }}
      >
        <Avatar size={isMobile ? 80 : 96} src={user.photoUrl ?? undefined} icon={<UserOutlined />} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {user.fullName}
          </Typography.Title>
          <div style={{ margin: '6px 0 10px' }}>
            <Tag color={ROLE_TAG_COLOR[user.role]}>{ROLE_LABELS[user.role]}</Tag>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Typography.Text type="secondary">
              <IdcardOutlined style={{ marginInlineEnd: 6 }} />
              {user.loginId}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ wordBreak: 'break-all' }}>
              <MailOutlined style={{ marginInlineEnd: 6 }} />
              {user.email}
            </Typography.Text>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ProfileInfoTab() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const updateProfile = useUpdateMyProfile();
  const uploadPhoto = useUploadPhoto();
  const [photo, setPhoto] = useState<File | null>(null);
  const [form] = Form.useForm<ProfileFormValues>();
  const isMobile = useIsMobile();

  const handleSave = async (values: ProfileFormValues) => {
    try {
      let photo_url = user?.photoUrl ?? undefined;
      if (photo) {
        photo_url = await uploadPhoto.mutateAsync({ prefix: 'user-photos', file: photo });
      }
      const updated = await updateProfile.mutateAsync({ full_name: values.full_name, photo_url });
      if (user) {
        setUser({ ...user, fullName: updated.full_name, photoUrl: updated.photo_url });
      }
      message.success('Profile updated');
      setPhoto(null);
    } catch {
      message.error('Could not update profile');
    }
  };

  if (!user) return null;

  return (
    <Card style={{ borderRadius: 14, maxWidth: isMobile ? undefined : 480 }}>
      <Form form={form} layout="vertical" initialValues={{ full_name: user.fullName }} onFinish={handleSave}>
        <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}>
          <Input size="large" />
        </Form.Item>
        <Form.Item label="Profile Photo">
          <PhotoCapture label="Upload a new photo (optional)" onCapture={setPhoto} />
        </Form.Item>
        <Button type="primary" size="large" block={isMobile} htmlType="submit" loading={updateProfile.isPending || uploadPhoto.isPending}>
          Save Changes
        </Button>
      </Form>
    </Card>
  );
}

function ChangePasswordTab() {
  const changePassword = useChangeMyPassword();
  const [form] = Form.useForm<PasswordFormValues>();
  const isMobile = useIsMobile();

  const handleSubmit = async (values: PasswordFormValues) => {
    if (values.new_password !== values.confirm_password) {
      message.error('New passwords do not match');
      return;
    }
    try {
      await changePassword.mutateAsync({
        current_password: values.current_password,
        new_password: values.new_password,
      });
      message.success('Password changed');
      form.resetFields();
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 403) {
        message.error('Current password is incorrect');
      } else {
        message.error('Could not change password');
      }
    }
  };

  return (
    <Card style={{ borderRadius: 14, maxWidth: isMobile ? undefined : 420 }}>
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item name="current_password" label="Current Password" rules={[{ required: true }]}>
          <Input.Password size="large" />
        </Form.Item>
        <Form.Item name="new_password" label="New Password" rules={[{ required: true, min: 8 }]}>
          <Input.Password size="large" />
        </Form.Item>
        <Form.Item name="confirm_password" label="Confirm New Password" rules={[{ required: true }]}>
          <Input.Password size="large" />
        </Form.Item>
        <Button type="primary" size="large" block={isMobile} htmlType="submit" loading={changePassword.isPending}>
          Change Password
        </Button>
      </Form>
    </Card>
  );
}

function MyActivityTab() {
  const { data, isLoading } = useMyActivity();
  const navigate = useNavigate();
  const setSelectedProjectId = useProjectContextStore((s) => s.setSelectedProjectId);
  const { fmtDate } = useDateFormat();

  const items = data?.items ?? [];

  return (
    <Card loading={isLoading} style={{ borderRadius: 14 }} styles={{ body: items.length === 0 ? undefined : { padding: 0 } }}>
      {items.length === 0 ? (
        <Empty description="No recent activity" />
      ) : (
        <List
          dataSource={items}
          renderItem={(entry, idx) => (
            <List.Item
              key={idx}
              style={{ cursor: 'pointer', padding: '12px 20px' }}
              onClick={() => {
                setSelectedProjectId(entry.project_id);
                navigate(entry.link_url);
              }}
            >
              <List.Item.Meta
                title={
                  <>
                    <Tag>{entry.type.replace(/_/g, ' ')}</Tag> {entry.description}
                  </>
                }
                description={fmtDate(entry.activity_date)}
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}

export function ProfilePage() {
  return (
    <div>
      <Typography.Title level={3}>My Profile</Typography.Title>
      <ProfileHero />
      <Tabs
        items={[
          { key: 'info', label: 'Edit Profile', children: <ProfileInfoTab /> },
          { key: 'password', label: 'Change Password', children: <ChangePasswordTab /> },
          { key: 'activity', label: 'My Activity', children: <MyActivityTab /> },
        ]}
      />
    </div>
  );
}
