import { useState } from 'react';
import { Button, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
  useCreateUser,
  useResetUserPassword,
  useUpdateUser,
  useUsers,
  type UserCreateInput,
  type UserRead,
  type UserUpdateInput,
} from '@/api/hooks/useUsers';
import type { UserRole } from '@/store/auth-store';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'SITE_ENGINEER', label: 'Site Engineer' },
  { value: 'PROJECT_MANAGER', label: 'Project Manager' },
  { value: 'QUANTITY_SURVEYOR', label: 'Quantity Surveyor' },
  { value: 'STORE_KEEPER', label: 'Store Keeper' },
  { value: 'ADMIN', label: 'Admin' },
];

interface CreateFormValues {
  login_id: string;
  full_name: string;
  email: string;
  phone?: string;
  password: string;
  role: UserRole;
}

interface EditFormValues {
  full_name: string;
  email: string;
  phone?: string;
  role: UserRole;
  is_active: boolean;
}

interface ResetPasswordFormValues {
  new_password: string;
}

export function UsersPage() {
  const { data: users, isLoading } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetUserPassword();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRead | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserRead | null>(null);
  const [createForm] = Form.useForm<CreateFormValues>();
  const [editForm] = Form.useForm<EditFormValues>();
  const [resetPasswordForm] = Form.useForm<ResetPasswordFormValues>();

  const handleCreate = async (values: CreateFormValues) => {
    try {
      const payload: UserCreateInput = { ...values, phone: values.phone || null };
      await createUser.mutateAsync(payload);
      message.success('User created');
      setCreateOpen(false);
      createForm.resetFields();
    } catch {
      message.error('Could not create user — User ID or email may already be taken');
    }
  };

  const openEdit = (user: UserRead) => {
    setEditingUser(user);
    editForm.setFieldsValue({
      full_name: user.full_name,
      email: user.email,
      phone: user.phone ?? undefined,
      role: user.role,
      is_active: user.is_active,
    });
  };

  const handleEdit = async (values: EditFormValues) => {
    if (!editingUser) return;
    try {
      const payload: UserUpdateInput = { ...values, phone: values.phone || null };
      await updateUser.mutateAsync({ id: editingUser.id, data: payload });
      message.success('User updated');
      setEditingUser(null);
    } catch {
      message.error('Could not update user');
    }
  };

  const handleResetPassword = async (values: ResetPasswordFormValues) => {
    if (!resetPasswordUser) return;
    try {
      await resetPassword.mutateAsync({ id: resetPasswordUser.id, new_password: values.new_password });
      message.success(`Password reset for ${resetPasswordUser.full_name}`);
      setResetPasswordUser(null);
      resetPasswordForm.resetFields();
    } catch {
      message.error('Could not reset password');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Users
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Add User
        </Button>
      </div>

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={users ?? []}
        scroll={{ x: 850 }}
        columns={[
          { title: 'User ID', dataIndex: 'login_id' },
          { title: 'Name', dataIndex: 'full_name' },
          { title: 'Email', dataIndex: 'email' },
          { title: 'Phone', dataIndex: 'phone', render: (v: string | null) => v ?? '—' },
          {
            title: 'Role',
            dataIndex: 'role',
            render: (role: UserRole) => ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role,
          },
          {
            title: 'Status',
            dataIndex: 'is_active',
            render: (active: boolean) => <Tag color={active ? 'green' : 'default'}>{active ? 'Active' : 'Inactive'}</Tag>,
          },
          {
            title: 'Actions',
            key: 'actions',
            render: (_, user: UserRead) => (
              <Space>
                <Button size="small" onClick={() => openEdit(user)}>Edit</Button>
                <Button size="small" onClick={() => setResetPasswordUser(user)}>Reset Password</Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="Add User"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createUser.isPending}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="login_id" label="User ID" rules={[{ required: true }]}>
            <Input placeholder="e.g. jsmith" />
          </Form.Item>
          <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit User"
        open={editingUser !== null}
        onCancel={() => setEditingUser(null)}
        onOk={() => editForm.submit()}
        confirmLoading={updateUser.isPending}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item name="is_active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Reset Password — ${resetPasswordUser?.full_name ?? ''}`}
        open={resetPasswordUser !== null}
        onCancel={() => { setResetPasswordUser(null); resetPasswordForm.resetFields(); }}
        onOk={() => resetPasswordForm.submit()}
        confirmLoading={resetPassword.isPending}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          Sets a new password for this user immediately. They will need to use it on their next sign-in — this does
          not require their current password.
        </Typography.Paragraph>
        <Form form={resetPasswordForm} layout="vertical" onFinish={handleResetPassword}>
          <Form.Item name="new_password" label="New Password" rules={[{ required: true, min: 8 }]}>
            <Input.Password placeholder="At least 8 characters" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
