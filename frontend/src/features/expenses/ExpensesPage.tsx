import { useState } from 'react';
import { Button, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { AxiosError } from 'axios';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useExpenseCategories } from '@/api/hooks/useMasters';
import { useCreateExpense, useDeleteExpense, useExpenses, useUpdateExpense, type ExpenseRead } from '@/api/hooks/useExpenses';

interface ExpenseFormValues {
  expense_category_id: string;
  amount: number;
  expense_date: Dayjs;
  vendor_name?: string;
  remarks?: string;
}

export function ExpensesPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: expenses, isLoading } = useExpenses(selectedProjectId);
  const { data: categories } = useExpenseCategories();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRead | null>(null);
  const [createForm] = Form.useForm<ExpenseFormValues>();
  const [editForm] = Form.useForm<ExpenseFormValues>();

  const categoryById = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const handleCreate = async (values: ExpenseFormValues) => {
    if (!selectedProjectId) return;
    try {
      await createExpense.mutateAsync({
        project_id: selectedProjectId,
        expense_category_id: values.expense_category_id,
        amount: String(values.amount),
        expense_date: values.expense_date.format('YYYY-MM-DD'),
        vendor_name: values.vendor_name,
        remarks: values.remarks,
      });
      message.success('Expense recorded');
      setCreateModalOpen(false);
      createForm.resetFields();
    } catch {
      message.error('Could not record expense');
    }
  };

  const openEdit = (expense: ExpenseRead) => {
    setEditingExpense(expense);
    editForm.setFieldsValue({
      expense_category_id: expense.expense_category_id,
      amount: parseFloat(expense.amount),
      expense_date: dayjs(expense.expense_date),
      vendor_name: expense.vendor_name ?? undefined,
      remarks: expense.remarks ?? undefined,
    });
  };

  const handleEdit = async (values: ExpenseFormValues) => {
    if (!editingExpense) return;
    try {
      await updateExpense.mutateAsync({
        id: editingExpense.id,
        data: {
          expense_category_id: values.expense_category_id,
          amount: String(values.amount),
          expense_date: values.expense_date.format('YYYY-MM-DD'),
          vendor_name: values.vendor_name,
          remarks: values.remarks,
        },
      });
      message.success('Expense updated');
      setEditingExpense(null);
      editForm.resetFields();
    } catch {
      message.error('Could not update expense');
    }
  };

  const handleDelete = async (id: string, projectId: string) => {
    try {
      await deleteExpense.mutateAsync({ id, projectId });
      message.success('Expense deleted');
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 409) message.error('Cannot delete — this expense is referenced by other data.');
      else message.error('Could not delete expense');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Expense Tracker
        </Typography.Title>
        <Space>
          <ProjectSelector />
          <Button type="primary" icon={<PlusOutlined />} disabled={!selectedProjectId} onClick={() => setCreateModalOpen(true)}>
            Add Expense
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={expenses ?? []}
        pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['10', '25', '50', '100'], showTotal: (total) => `${total} expenses` }}
        columns={[
          { title: 'Date', dataIndex: 'expense_date', sorter: (a: ExpenseRead, b: ExpenseRead) => a.expense_date.localeCompare(b.expense_date) },
          { title: 'Category', dataIndex: 'expense_category_id', render: (id: string) => categoryById.get(id) ?? id },
          { title: 'Amount', dataIndex: 'amount', sorter: (a: ExpenseRead, b: ExpenseRead) => parseFloat(a.amount) - parseFloat(b.amount) },
          { title: 'Vendor', dataIndex: 'vendor_name', sorter: (a: ExpenseRead, b: ExpenseRead) => (a.vendor_name ?? '').localeCompare(b.vendor_name ?? '') },
          { title: 'Remarks', dataIndex: 'remarks' },
          {
            title: 'Actions',
            key: 'actions',
            width: 100,
            render: (_, expense) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(expense)} />
                <Popconfirm
                  title="Delete this expense?"
                  description="This cannot be undone."
                  onConfirm={() => handleDelete(expense.id, expense.project_id)}
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="Add Expense"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createExpense.isPending}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate} initialValues={{ expense_date: dayjs() }}>
          <Form.Item name="expense_category_id" label="Category" rules={[{ required: true }]}>
            <Select options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="expense_date" label="Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="vendor_name" label="Vendor (reference only)">
            <Input />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit Expense"
        open={!!editingExpense}
        onCancel={() => setEditingExpense(null)}
        onOk={() => editForm.submit()}
        confirmLoading={updateExpense.isPending}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item name="expense_category_id" label="Category" rules={[{ required: true }]}>
            <Select options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="expense_date" label="Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="vendor_name" label="Vendor">
            <Input />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
