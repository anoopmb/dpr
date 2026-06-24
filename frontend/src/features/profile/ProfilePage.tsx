import { useState } from 'react';
import { Avatar, Button, Card, Empty, Form, Input, List, Tabs, Tag, Typography, message } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useAuthStore } from '@/store/auth-store';
import { useUpdateMyProfile, useChangeMyPassword } from '@/api/hooks/useUsers';
import { useMyActivity } from '@/api/hooks/useActivity';
import { useUploadPhoto } from '@/api/hooks/useUpload';
import { PhotoCapture } from '@/components/common/PhotoCapture';
import { useProjectContextStore } from '@/store/project-context-store';

interface ProfileFormValues {
  full_name: string;
}

interface PasswordFormValues {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

function ProfileInfoTab() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const updateProfile = useUpdateMyProfile();
  const uploadPhoto = useUploadPhoto();
  const [photo, setPhoto] = useState<File | null>(null);
  const [form] = Form.useForm<ProfileFormValues>();

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
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Avatar size={64} src={user.photoUrl ?? undefined} icon={<UserOutlined />} />
        <div>
          <Typography.Text strong style={{ fontSize: 16 }}>
            {user.fullName}
          </Typography.Text>
          <br />
          <Typography.Text type="secondary">
            User ID: {user.loginId} · {user.email}
          </Typography.Text>
        </div>
      </div>
      <Form form={form} layout="vertical" initialValues={{ full_name: user.fullName }} onFinish={handleSave}>
        <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Profile Photo">
          <PhotoCapture label="Upload a new photo (optional)" onCapture={setPhoto} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={updateProfile.isPending || uploadPhoto.isPending}>
          Save
        </Button>
      </Form>
    </Card>
  );
}

function ChangePasswordTab() {
  const changePassword = useChangeMyPassword();
  const [form] = Form.useForm<PasswordFormValues>();

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
    <Card style={{ maxWidth: 420 }}>
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item name="current_password" label="Current Password" rules={[{ required: true }]}>
          <Input.Password />
        </Form.Item>
        <Form.Item name="new_password" label="New Password" rules={[{ required: true, min: 8 }]}>
          <Input.Password />
        </Form.Item>
        <Form.Item name="confirm_password" label="Confirm New Password" rules={[{ required: true }]}>
          <Input.Password />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={changePassword.isPending}>
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

  const items = data?.items ?? [];

  return (
    <Card loading={isLoading}>
      {items.length === 0 ? (
        <Empty description="No recent activity" />
      ) : (
        <List
          dataSource={items}
          renderItem={(entry, idx) => (
            <List.Item
              key={idx}
              style={{ cursor: 'pointer' }}
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
                description={dayjs(entry.activity_date).format('DD MMM YYYY')}
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
      <Tabs
        items={[
          { key: 'info', label: 'Profile Info', children: <ProfileInfoTab /> },
          { key: 'password', label: 'Change Password', children: <ChangePasswordTab /> },
          { key: 'activity', label: 'My Activity', children: <MyActivityTab /> },
        ]}
      />
    </div>
  );
}
