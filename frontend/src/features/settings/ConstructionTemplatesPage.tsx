import { useState } from 'react';
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import {
  useConstructionTemplates,
  useCreateConstructionTemplate,
  useUpdateConstructionTemplate,
  useDeleteConstructionTemplate,
  type BoqConstructionTemplateRead,
} from '@/api/hooks/useBoq';
import { useMaterials, useUoms } from '@/api/hooks/useMasters';

const BITUMINOUS_TYPES = [
  { key: 'PRIME_COAT', label: 'Prime Coat' },
  { key: 'TACK_COAT', label: 'Tack Coat' },
  { key: 'BM', label: 'Bituminous Macadam (BM)' },
  { key: 'DBM', label: 'Dense Bituminous Macadam (DBM)' },
  { key: 'BC', label: 'Bituminous Concrete (BC)' },
];

interface TemplateFormValues {
  material_id: string;
  coefficient: number;
  coefficient_description?: string | null;
  uom_id: string;
}

interface TemplatesTabProps {
  constructionType: string;
  isActive: boolean;
}

function TemplatesTab({ constructionType, isActive }: TemplatesTabProps) {
  const { data: templates, isLoading } = useConstructionTemplates(isActive ? constructionType : undefined);
  const { data: materials } = useMaterials();
  const { data: uoms } = useUoms();
  const createTemplate = useCreateConstructionTemplate();
  const updateTemplate = useUpdateConstructionTemplate();
  const deleteTemplate = useDeleteConstructionTemplate();

  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<{ open: boolean; template: BoqConstructionTemplateRead | null }>({ open: false, template: null });
  const [addForm] = Form.useForm<TemplateFormValues>();
  const [editForm] = Form.useForm<Partial<TemplateFormValues>>();

  const filtered = (templates ?? []).filter((t) => t.construction_type === constructionType);

  const handleAdd = async (values: TemplateFormValues) => {
    try {
      await createTemplate.mutateAsync({
        construction_type: constructionType,
        material_id: values.material_id,
        coefficient: String(values.coefficient),
        coefficient_description: values.coefficient_description || null,
        uom_id: values.uom_id,
      });
      message.success('Template added');
      setAddModal(false);
      addForm.resetFields();
    } catch {
      message.error('Could not add template — check for duplicate material.');
    }
  };

  const handleEdit = async (values: Partial<TemplateFormValues>) => {
    if (!editModal.template) return;
    try {
      await updateTemplate.mutateAsync({
        id: editModal.template.id,
        data: {
          coefficient: values.coefficient != null ? String(values.coefficient) : undefined,
          coefficient_description: values.coefficient_description,
        },
      });
      message.success('Template updated');
      setEditModal({ open: false, template: null });
    } catch {
      message.error('Could not update template');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate.mutateAsync(id);
      message.success('Template deleted');
    } catch {
      message.error('Could not delete template');
    }
  };

  const materialById = new Map((materials ?? []).map((m) => [m.id, m]));
  const uomById = new Map((uoms ?? []).map((u) => [u.id, u]));

  const columns: TableColumnsType<BoqConstructionTemplateRead> = [
    {
      title: 'Material',
      key: 'material',
      render: (_, t) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{t.material_name}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>{t.material_code}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Coefficient',
      dataIndex: 'coefficient',
      width: 120,
      render: (v: string, t) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{v}</Typography.Text>
          {t.coefficient_description && (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>{t.coefficient_description}</Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: 'UOM',
      key: 'uom',
      width: 80,
      render: (_, t) => <Tag>{t.uom_code || uomById.get(t.uom_id)?.code || '—'}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      width: 80,
      render: (active: boolean) => <Tag color={active ? 'green' : 'default'}>{active ? 'Active' : 'Inactive'}</Tag>,
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, t) => (
        <Space size={4}>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={() => {
              editForm.setFieldsValue({
                coefficient: parseFloat(t.coefficient),
                coefficient_description: t.coefficient_description,
              });
              setEditModal({ open: true, template: t });
            }}
          />
          <Popconfirm title="Delete this template?" onConfirm={() => handleDelete(t.id)} okButtonProps={{ danger: true }}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => { addForm.resetFields(); setAddModal(true); }}
        >
          Add Template
        </Button>
      </div>
      <Table<BoqConstructionTemplateRead>
        rowKey="id"
        size="small"
        dataSource={filtered}
        columns={columns}
        loading={isLoading}
        pagination={false}
        locale={{ emptyText: 'No templates configured for this type. Click "Add Template" to add one.' }}
      />

      <Modal
        title="Add Material Template"
        open={addModal}
        onCancel={() => setAddModal(false)}
        onOk={() => addForm.submit()}
        confirmLoading={createTemplate.isPending}
        destroyOnHidden
      >
        <Form form={addForm} layout="vertical" onFinish={handleAdd}>
          <Form.Item name="material_id" label="Material" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select material"
              options={(materials ?? []).filter((m) => m.is_active).map((m) => ({
                value: m.id,
                label: `${m.name} (${m.code})`,
              }))}
            />
          </Form.Item>
          <Form.Item name="uom_id" label="Unit of Measure" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={(uoms ?? []).map((u) => ({ value: u.id, label: `${u.code} — ${u.name}` }))}
            />
          </Form.Item>
          <Form.Item
            name="coefficient"
            label="Coefficient (qty per unit of BOQ quantity)"
            rules={[{ required: true }]}
            extra="E.g. 0.8 means 0.8 kg of binder per m² of surface area."
          >
            <InputNumber min={0} step={0.0001} precision={4} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="coefficient_description" label="Coefficient Notes (optional)">
            <Input placeholder="e.g. kg/m² @ 75mm thickness" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit Template"
        open={editModal.open}
        onCancel={() => setEditModal({ open: false, template: null })}
        onOk={() => editForm.submit()}
        confirmLoading={updateTemplate.isPending}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item
            name="coefficient"
            label="Coefficient"
            rules={[{ required: true }]}
          >
            <InputNumber min={0} step={0.0001} precision={4} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="coefficient_description" label="Notes (optional)">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export function ConstructionTemplatesPage() {
  const [activeTab, setActiveTab] = useState('PRIME_COAT');

  return (
    <div>
      <Typography.Title level={3} style={{ marginBottom: 4 }}>
        Construction Material Templates
      </Typography.Title>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Configure material coefficients for bituminous construction types. When a measurement is
        recorded for a BOQ item of these types, materials are auto-calculated and added to the DPR.
      </Typography.Text>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={BITUMINOUS_TYPES.map(({ key, label }) => ({
          key,
          label,
          children: <TemplatesTab constructionType={key} isActive={activeTab === key} />,
        }))}
      />
    </div>
  );
}
