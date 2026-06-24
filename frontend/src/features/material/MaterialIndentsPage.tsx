import { useState } from 'react';
import {
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useMaterials, useStockLocations, useUoms } from '@/api/hooks/useMasters';
import {
  useApproveIndent,
  useCancelIndent,
  useCreateMaterialIndent,
  useIssueIndentItem,
  useMaterialIndents,
  useReceiveIndentItem,
  useRejectIndent,
  useSubmitIndent,
  type MaterialIndentStatus,
} from '@/api/hooks/useMaterialIndents';
import { useAuthStore } from '@/store/auth-store';
import { useDateFormat } from '@/utils/format';

const STATUS_COLOR: Record<MaterialIndentStatus, string> = {
  DRAFT: 'default',
  SUBMITTED: 'blue',
  APPROVED: 'gold',
  REJECTED: 'red',
  ISSUED: 'cyan',
  PARTIALLY_RECEIVED: 'orange',
  RECEIVED: 'green',
  CANCELLED: 'default',
};

interface IndentItemFormValues {
  material_id: string;
  uom_id: string;
  requested_qty: number;
}

interface IndentFormValues {
  source_type: 'HEAD_OFFICE' | 'SITE_TRANSFER';
  source_location_id: string;
  items: IndentItemFormValues[];
}

export function MaterialIndentsPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: indents, isLoading } = useMaterialIndents(selectedProjectId);
  const { data: materials } = useMaterials();
  const { data: uoms } = useUoms();
  const { data: stockLocations } = useStockLocations();
  const user = useAuthStore((s) => s.user);

  const createIndent = useCreateMaterialIndent();
  const submitIndent = useSubmitIndent();
  const approveIndent = useApproveIndent();
  const rejectIndent = useRejectIndent();
  const cancelIndent = useCancelIndent();
  const issueItem = useIssueIndentItem();
  const receiveItem = useReceiveIndentItem();
  const { fmtDate } = useDateFormat();

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<IndentFormValues>();
  const [searchText, setSearchText] = useState('');

  const materialById = new Map((materials ?? []).map((m) => [m.id, m]));
  const uomById = new Map((uoms ?? []).map((u) => [u.id, u.code]));

  const filteredIndents = (indents ?? []).filter((indent) => {
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return indent.items.some((item) => (materialById.get(item.material_id)?.name ?? '').toLowerCase().includes(q));
  });

  const handleCreate = async (values: IndentFormValues) => {
    if (!selectedProjectId) return;
    try {
      await createIndent.mutateAsync({
        requesting_project_id: selectedProjectId,
        source_type: values.source_type,
        source_location_id: values.source_location_id,
        items: values.items.map((item) => ({
          material_id: item.material_id,
          uom_id: item.uom_id,
          requested_qty: String(item.requested_qty),
        })),
      });
      message.success('Material indent created');
      setModalOpen(false);
      form.resetFields();
    } catch {
      message.error('Could not create indent');
    }
  };

  const runAction = async (action: { mutateAsync: (id: string) => Promise<unknown> }, id: string, label: string) => {
    try {
      await action.mutateAsync(id);
      message.success(`Indent ${label}`);
    } catch {
      message.error(`Could not ${label.toLowerCase()} indent`);
    }
  };

  const promptIssue = (itemId: string) => {
    let issuedQty = '';
    Modal.confirm({
      title: 'Issue Material',
      content: (
        <InputNumber
          min={0}
          style={{ width: '100%' }}
          onChange={(value) => (issuedQty = String(value ?? ''))}
          placeholder="Quantity to issue"
        />
      ),
      onOk: async () => {
        if (!issuedQty) return;
        await issueItem.mutateAsync({ itemId, issuedQty });
        message.success('Material issued');
      },
    });
  };

  const promptReceive = (itemId: string) => {
    let receivedQty = '';
    Modal.confirm({
      title: 'Confirm Receipt',
      content: (
        <InputNumber
          min={0}
          style={{ width: '100%' }}
          onChange={(value) => (receivedQty = String(value ?? ''))}
          placeholder="Quantity received"
        />
      ),
      onOk: async () => {
        if (!receivedQty) return;
        await receiveItem.mutateAsync({ itemId, receivedQty });
        message.success('Receipt recorded');
      },
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Material Indents
        </Typography.Title>
        <Space>
          <ProjectSelector />
          <Input.Search
            placeholder="Search by material name"
            allowClear
            style={{ width: 240 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Button type="primary" icon={<PlusOutlined />} disabled={!selectedProjectId} onClick={() => setModalOpen(true)}>
            New Indent
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={filteredIndents}
        pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['10', '25', '50'], showTotal: (total) => `${total} indents` }}
        scroll={{ x: 600 }}
        expandable={{
          expandedRowRender: (indent) => (
            <Table
              rowKey="id"
              pagination={false}
              scroll={{ x: 650 }}
              dataSource={indent.items}
              columns={[
                { title: 'Material', dataIndex: 'material_id', render: (id: string) => materialById.get(id)?.name ?? id },
                { title: 'Unit', dataIndex: 'uom_id', render: (id: string) => uomById.get(id) ?? id },
                { title: 'Requested', dataIndex: 'requested_qty' },
                { title: 'Issued', dataIndex: 'issued_qty' },
                { title: 'Received', dataIndex: 'received_qty' },
                {
                  title: 'Item Actions',
                  key: 'actions',
                  render: (_, item) => (
                    <Space>
                      {(indent.status === 'APPROVED' || indent.status === 'ISSUED') &&
                        (user?.role === 'STORE_KEEPER' || user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER') && (
                          <Button size="small" onClick={() => promptIssue(item.id)}>
                            Issue
                          </Button>
                        )}
                      {(indent.status === 'ISSUED' || indent.status === 'PARTIALLY_RECEIVED') &&
                        (user?.role === 'SITE_ENGINEER' || user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER') && (
                          <Button size="small" onClick={() => promptReceive(item.id)}>
                            Receive
                          </Button>
                        )}
                    </Space>
                  ),
                },
              ]}
            />
          ),
        }}
        columns={[
          { title: 'Source', dataIndex: 'source_type', sorter: (a, b) => a.source_type.localeCompare(b.source_type), render: (v: string) => v === 'HEAD_OFFICE' ? 'Head Office Store' : 'Site Transfer' },
          {
            title: 'Status',
            dataIndex: 'status',
            sorter: (a, b) => a.status.localeCompare(b.status),
            render: (status: MaterialIndentStatus) => <Tag color={STATUS_COLOR[status]}>{status}</Tag>,
          },
          { title: 'Needed By', dataIndex: 'needed_by_date', sorter: (a, b) => (a.needed_by_date ?? '').localeCompare(b.needed_by_date ?? ''), render: (v: string | null) => fmtDate(v) },
          {
            title: 'Actions',
            key: 'actions',
            render: (_, indent) => (
              <Space>
                {indent.status === 'DRAFT' && (
                  <Button size="small" onClick={() => runAction(submitIndent, indent.id, 'submitted')}>
                    Submit
                  </Button>
                )}
                {indent.status === 'SUBMITTED' &&
                  (user?.role === 'STORE_KEEPER' || user?.role === 'PROJECT_MANAGER' || user?.role === 'ADMIN') && (
                    <>
                      <Button size="small" type="primary" onClick={() => runAction(approveIndent, indent.id, 'approved')}>
                        Approve
                      </Button>
                      <Button size="small" danger onClick={() => runAction(rejectIndent, indent.id, 'rejected')}>
                        Reject
                      </Button>
                    </>
                  )}
                {(indent.status === 'DRAFT' || indent.status === 'SUBMITTED') && (
                  <Button size="small" onClick={() => runAction(cancelIndent, indent.id, 'cancelled')}>
                    Cancel
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="New Material Indent"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createIndent.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} initialValues={{ items: [{}] }}>
          <Form.Item name="source_type" label="Source Type" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'HEAD_OFFICE', label: 'Head Office Store' },
                { value: 'SITE_TRANSFER', label: 'Site-to-Site Transfer' },
              ]}
            />
          </Form.Item>
          <Form.Item name="source_location_id" label="Source Location" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={(stockLocations ?? []).map((l) => ({ value: l.id, label: `${l.name} (${l.location_type})` }))}
            />
          </Form.Item>

          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Row key={field.key} gutter={[8, 0]} align="middle" style={{ marginBottom: 8 }}>
                    <Col xs={24} sm={10}>
                      <Form.Item name={[field.name, 'material_id']} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                        <Select placeholder="Material" showSearch optionFilterProp="label" options={(materials ?? []).map((m) => ({ value: m.id, label: m.name }))} />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={5}>
                      <Form.Item name={[field.name, 'uom_id']} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                        <Select placeholder="Unit" showSearch optionFilterProp="label" options={(uoms ?? []).map((u) => ({ value: u.id, label: u.code }))} />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={5}>
                      <Form.Item name={[field.name, 'requested_qty']} rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                        <InputNumber min={0} placeholder="Qty" style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    {fields.length > 1 && (
                      <Col xs={24} sm={4}>
                        <Button danger block onClick={() => remove(field.name)}>Remove</Button>
                      </Col>
                    )}
                  </Row>
                ))}
                <Button onClick={() => add()} block style={{ marginTop: 4 }}>
                  Add Material Line
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
}
