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
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { DeleteOutlined, EditOutlined, InfoCircleOutlined, PlusOutlined } from '@ant-design/icons';
import {
  useConstructionTemplates,
  useCreateConstructionTemplate,
  useUpdateConstructionTemplate,
  useDeleteConstructionTemplate,
  type BoqConstructionTemplateRead,
} from '@/api/hooks/useBoq';
import { useMaterials, useUoms } from '@/api/hooks/useMasters';
import { useNumberFormat } from '@/utils/format';

interface TypeConfig {
  key: string;
  label: string;
  subtypeLabel?: string;
  subtypeOptions?: { value: string; label: string }[];
}

const TYPE_CONFIGS: TypeConfig[] = [
  {
    key: 'CONCRETE',
    label: 'Concrete',
    subtypeLabel: 'Grade',
    subtypeOptions: ['M10', 'M15', 'M20', 'M25', 'M30', 'M35', 'M40'].map((g) => ({ value: g, label: g })),
  },
  {
    key: 'STEEL',
    label: 'Steel (HYSD Bars)',
    subtypeLabel: 'Diameter',
    subtypeOptions: ['10', '12', '16', '20', '25', '32'].map((d) => ({ value: d, label: `${d} mm` })),
  },
  { key: 'PRIME_COAT', label: 'Prime Coat' },
  { key: 'TACK_COAT', label: 'Tack Coat' },
  { key: 'BM', label: 'Bituminous Macadam (BM)' },
  { key: 'DBM', label: 'Dense Bituminous Macadam (DBM)' },
  { key: 'BC', label: 'Bituminous Concrete (BC)' },
];

interface AddFormValues {
  material_id: string;
  construction_subtype?: string;
  coefficient: number;
  rate?: number | null;
  coefficient_description?: string | null;
  uom_id: string;
}

interface EditFormValues {
  coefficient?: number;
  rate?: number | null;
  coefficient_description?: string | null;
}

interface TemplatesTabProps {
  config: TypeConfig;
  isActive: boolean;
}

function TemplatesTab({ config, isActive }: TemplatesTabProps) {
  const { data: templates, isLoading } = useConstructionTemplates(isActive ? config.key : undefined);
  const { data: materials } = useMaterials();
  const { data: uoms } = useUoms();
  const createTemplate = useCreateConstructionTemplate();
  const updateTemplate = useUpdateConstructionTemplate();
  const deleteTemplate = useDeleteConstructionTemplate();
  const { fmtAmt, symbol } = useNumberFormat();

  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<{ open: boolean; template: BoqConstructionTemplateRead | null }>({
    open: false,
    template: null,
  });
  const [addForm] = Form.useForm<AddFormValues>();
  const [editForm] = Form.useForm<EditFormValues>();

  const hasSubtype = !!config.subtypeOptions;
  const filtered = (templates ?? []).filter((t) => t.construction_type === config.key);

  const handleAdd = async (values: AddFormValues) => {
    try {
      await createTemplate.mutateAsync({
        construction_type: config.key,
        construction_subtype: hasSubtype ? (values.construction_subtype ?? null) : null,
        material_id: values.material_id,
        coefficient: String(values.coefficient),
        rate: values.rate != null ? String(values.rate) : null,
        coefficient_description: values.coefficient_description || null,
        uom_id: values.uom_id,
      });
      message.success('Template added');
      setAddModal(false);
      addForm.resetFields();
    } catch {
      message.error('Could not add template — check for duplicate material / subtype combination.');
    }
  };

  const handleEdit = async (values: EditFormValues) => {
    if (!editModal.template) return;
    try {
      await updateTemplate.mutateAsync({
        id: editModal.template.id,
        data: {
          coefficient: values.coefficient != null ? String(values.coefficient) : undefined,
          rate: values.rate != null ? String(values.rate) : undefined,
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

  const columns: TableColumnsType<BoqConstructionTemplateRead> = [
    ...(hasSubtype
      ? [
          {
            title: config.subtypeLabel,
            dataIndex: 'construction_subtype',
            width: 100,
            render: (v: string | null) =>
              v ? (
                <Tag color="blue">
                  {config.key === 'STEEL' ? `${v} mm` : v}
                </Tag>
              ) : (
                '—'
              ),
          },
        ]
      : []),
    {
      title: 'Material',
      key: 'material',
      render: (_: unknown, t: BoqConstructionTemplateRead) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{t.material_name}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {t.material_code}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: (
        <Tooltip title="Quantity of this material per 1 unit of BOQ measurement (IS code / SOR specification)">
          Qty / unit <InfoCircleOutlined style={{ fontSize: 11, opacity: 0.5 }} />
        </Tooltip>
      ),
      dataIndex: 'coefficient',
      width: 130,
      render: (v: string, t: BoqConstructionTemplateRead) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>
            {v} <Typography.Text type="secondary" style={{ fontSize: 11 }}>{t.uom_code}</Typography.Text>
          </Typography.Text>
          {t.coefficient_description && (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {t.coefficient_description}
            </Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: `Rate (${symbol})`,
      dataIndex: 'rate',
      width: 110,
      align: 'right' as const,
      render: (v: string | null) =>
        v != null ? (
          <Typography.Text>{fmtAmt(parseFloat(v))}</Typography.Text>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: `Amt / unit (${symbol})`,
      key: 'amt_unit',
      width: 130,
      align: 'right' as const,
      render: (_: unknown, t: BoqConstructionTemplateRead) => {
        if (t.rate == null) return <Typography.Text type="secondary">—</Typography.Text>;
        const amt = parseFloat(t.coefficient) * parseFloat(t.rate);
        return <Typography.Text strong>{fmtAmt(amt)}</Typography.Text>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      width: 80,
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>{active ? 'Active' : 'Inactive'}</Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: unknown, t: BoqConstructionTemplateRead) => (
        <Space size={4}>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={() => {
              editForm.setFieldsValue({
                coefficient: parseFloat(t.coefficient),
                rate: t.rate != null ? parseFloat(t.rate) : null,
                coefficient_description: t.coefficient_description,
              });
              setEditModal({ open: true, template: t });
            }}
          />
          <Popconfirm
            title="Delete this template?"
            description="Auto-calculated material rows already on existing DPR entries will not be removed."
            onConfirm={() => handleDelete(t.id)}
            okButtonProps={{ danger: true }}
          >
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
          onClick={() => {
            addForm.resetFields();
            setAddModal(true);
          }}
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
        locale={{ emptyText: 'No templates configured. Click "Add Template" to add one.' }}
      />

      {/* Add modal */}
      <Modal
        title="Add Material Template"
        open={addModal}
        onCancel={() => setAddModal(false)}
        onOk={() => addForm.submit()}
        confirmLoading={createTemplate.isPending}
        destroyOnHidden
      >
        <Form form={addForm} layout="vertical" onFinish={handleAdd}>
          {hasSubtype && (
            <Form.Item
              name="construction_subtype"
              label={config.subtypeLabel}
              rules={[{ required: true, message: `${config.subtypeLabel} is required` }]}
            >
              <Select
                placeholder={`Select ${config.subtypeLabel?.toLowerCase()}`}
                options={config.subtypeOptions}
              />
            </Form.Item>
          )}

          <Form.Item name="material_id" label="Material" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select material"
              options={(materials ?? [])
                .filter((m) => m.is_active)
                .map((m) => ({ value: m.id, label: `${m.name} (${m.code})` }))}
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
            label="Qty / unit"
            rules={[{ required: true, message: 'Quantity per unit is required' }, { type: 'number', min: 0.000001, message: 'Must be greater than 0' }]}
            extra="Quantity of this material consumed per 1 unit of BOQ measurement (e.g. 8.0 bags per m³ for M20 cement)."
          >
            <InputNumber min={0.000001} step={0.001} precision={6} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="rate"
            label={`Rate per unit (${symbol}) — SOR / Analysis Rate`}
            rules={[{ type: 'number', min: 0, message: 'Rate cannot be negative' }]}
            extra="Rate from Schedule of Rates applicable to this construction type. Leave blank if not yet determined."
          >
            <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="e.g. 450.00" />
          </Form.Item>

          <Form.Item name="coefficient_description" label="Notes (optional)">
            <Input placeholder="e.g. IS 10262 nominal mix, including wastage @ 5%" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit modal */}
      <Modal
        title={
          editModal.template
            ? `Edit — ${editModal.template.material_name}${editModal.template.construction_subtype ? ` (${editModal.template.construction_subtype})` : ''}`
            : 'Edit Template'
        }
        open={editModal.open}
        onCancel={() => setEditModal({ open: false, template: null })}
        onOk={() => editForm.submit()}
        confirmLoading={updateTemplate.isPending}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item
            name="coefficient"
            label="Qty / unit"
            rules={[
              { required: true, message: 'Quantity per unit is required' },
              { type: 'number', min: 0.000001, message: 'Must be greater than 0' },
            ]}
          >
            <InputNumber min={0.000001} step={0.001} precision={6} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="rate"
            label={`Rate per unit (${symbol}) — SOR / Analysis Rate`}
            rules={[{ type: 'number', min: 0, message: 'Rate cannot be negative' }]}
            extra="Leave blank to fall back to the material master rate."
          >
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
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
  const [activeTab, setActiveTab] = useState('CONCRETE');

  return (
    <div>
      <Typography.Title level={3} style={{ marginBottom: 4 }}>
        Construction Material Templates
      </Typography.Title>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Configure material combinations, quantities per unit, and Schedule of Rates (SOR) prices for
        each construction type. When a measurement is recorded for a BOQ item of these types,
        materials are auto-calculated and added to the DPR.
      </Typography.Text>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={TYPE_CONFIGS.map((cfg) => ({
          key: cfg.key,
          label: cfg.label,
          children: <TemplatesTab config={cfg} isActive={activeTab === cfg.key} />,
        }))}
      />
    </div>
  );
}
