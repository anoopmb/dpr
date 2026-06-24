import { useState } from 'react';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthStore, type AuthUser, type UserRole } from '@/store/auth-store';

interface MeResponse {
  id: string;
  login_id: string;
  full_name: string;
  email: string;
  photo_url: string | null;
  role: UserRole;
}

export function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { login_id: string; password: string }) => {
    setLoading(true);
    try {
      const { data } = await apiClient.post<MeResponse>('/auth/login', values);
      const user: AuthUser = {
        id: data.id,
        loginId: data.login_id,
        fullName: data.full_name,
        email: data.email,
        photoUrl: data.photo_url,
        role: data.role,
      };
      queryClient.setQueryData(['session'], user);
      setUser(user);
      navigate(user.role === 'SITE_ENGINEER' ? '/field/dpr-today' : '/dashboard');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        message.error('Incorrect User ID or password.');
      } else {
        message.error('Could not sign in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <Card style={{ width: 360 }}>
        <Typography.Title level={3}>DPR System</Typography.Title>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="login_id" label="User ID" rules={[{ required: true }]}>
            <Input placeholder="e.g. jsmith" autoFocus />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Sign in
          </Button>
        </Form>
      </Card>
    </div>
  );
}
