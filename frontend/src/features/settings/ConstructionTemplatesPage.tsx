import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Collapse,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import {
  useConstructionTemplates,
  useCreateConstructionTemplate,
  useUpdateConstructionTemplate,
  useDeleteConstructionTemplate,
  useAddTemplateItem,
  useUpdateTemplateItem,
  useDeleteTemplateItem,
  type BoqConstructionTemplateRead,
  type BoqConstructionTemplateItemRead,
} from '@/api/hooks/useBoq';
import { useMaterials, useUoms } from '@/api/hooks/useMasters';
import { useNumberFormat } from '@/utils/format';
import { getApiErrorMessage } from '@/utils/api-error';

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
  { key: 'STEEL', label: 'Steel (HYSD Bars)' },
  { key: 'PRIME_COAT', label: 'Prime Coat' },
  { key: 'TACK_COAT', label: 'Tack Coat' },
  { key: 'BM', label: 'Bituminous Macadam (BM)' },
  { key: 'DBM', label: 'Dense Bituminous Macadam (DBM)' },
  { key: 'BC', label: 'Bituminous Concrete (BC)' },
];

const STEEL_DIAMETERS = [6, 8, 10, 12, 16, 20, 25, 32, 36, 40];

let rowKeyCounter = 0;
const nextKey = () => `r-${++rowKeyCounter}`;

// ── Local row type for the inline editor ─────────────────────────────────────

interface LocalRow {
  _key: string;
  id?: string;
  material_id: string | null;
  coefficient: number | null;
  rate: number | null;
  uom_id: string | null;
  notes: string;
  bar_diameter_mm: number | null;
  sort_order: number;
}

function rowsFromItems(items: BoqConstructionTemplateItemRead[]): LocalRow[] {
  return items.map((item) => ({
    _key: nextKey(),
    id: item.id,
    material_id: item.material_id,
    coefficient: parseFloat(item.coefficient),
    rate: item.rate != null ? parseFloat(item.rate) : null,
    uom_id: item.uom_id,
    notes: item.notes ?? '',
    bar_diameter_mm: item.bar_diameter_mm,
    sort_order: item.sort_order,
  }));
}

function blankRow(sortOrder: number): LocalRow {
  return {
    _key: nextKey(),
    material_id: null,
    coefficient: null,
    rate: null,
    uom_id: null,
    notes: '',
    bar_diameter_mm: null,
    sort_order: sortOrder,
  };
}

// ── Inline items editor ───────────────────────────────────────────────────────

interface ItemsEditorProps {
  template: BoqConstructionTemplateRead;
}

function ItemsEditor({ template }: ItemsEditorProps) {
  const { data: materials } = useMaterials();
  const { data: uoms } = useUoms();
  const addItem = useAddTemplateItem();
  const updateItem = useUpdateTemplateItem();
  const deleteItem = useDeleteTemplateItem();
  const { fmtAmt, symbol } = useNumberFormat();

  const [rows, setRows] = useState<LocalRow[]>(() => rowsFromItems(template.items));
  const [saving, setSaving] = useState(false);

  // Re-sync when template.items changes (after a save)
  useEffect(() => {
    setRows(rowsFromItems(template.items));
  }, [template.items]);

  const isSteel = template.construction_type === 'STEEL';

  const patch = (key: string, changes: Partial<LocalRow>) =>
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...changes } : r)));

  const removeRow = (key: string) => {
    const row = rows.find((r) => r._key === key);
    if (row?.id) {
      deleteItem.mutate(
        { templateId: template.id, itemId: row.id },
        { onError: (err) => message.error(getApiErrorMessage(err, 'Could not remove item')) },
      );
    }
    setRows((prev) => prev.filter((r) => r._key !== key));
  };

  const handleSave = async () => {
    const invalid = rows.filter((r) => !r.material_id || !r.uom_id || r.coefficient == null || r.coefficient <= 0);
    if (invalid.length > 0) {
      message.warning('Fill in material, coefficient, and unit for all rows before saving.');
      return;
    }
    if (isSteel && rows.some((r) => r.bar_diameter_mm == null)) {
      message.warning('Select a bar diameter for every steel item.');
      return;
    }

    setSaving(true);
    try {
      for (const row of rows) {
        const payload = {
          material_id: row.material_id!,
          coefficient: String(row.coefficient!),
          rate: row.rate != null ? String(row.rate) : null,
          uom_id: row.uom_id!,
          notes: row.notes || null,
          bar_diameter_mm: isSteel ? row.bar_diameter_mm : null,
          sort_order: row.sort_order,
        };
        if (row.id) {
          await updateItem.mutateAsync({ templateId: template.id, itemId: row.id, data: payload });
        } else {
          await addItem.mutateAsync({ templateId: template.id, data: payload });
        }
      }
      message.success('Materials saved');
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not save materials'));
    } finally {
      setSaving(false);
    }
  };

  const materialOptions = useMemo(
    () =>
      (materials ?? [])
        .filter((m) => m.is_active)
        .map((m) => ({ value: m.id, label: `${m.name} (${m.code})` })),
    [materials],
  );
  const uomOptions = useMemo(
    () => (uoms ?? []).map((u) => ({ value: u.id, label: `${u.code} — ${u.name}` })),
    [uoms],
  );

  const columns: TableColumnsType<LocalRow> = [
    ...(isSteel
      ? [
          {
            title: 'Dia (mm)',
            key: 'dia',
            width: 100,
            render: (_: unknown, row: LocalRow) => (
              <Select
                size="small"
                value={row.bar_diameter_mm ?? undefined}
                onChange={(v) => patch(row._key, { bar_diameter_mm: v })}
                placeholder="Select"
                options={STEEL_DIAMETERS.map((d) => ({ value: d, label: `${d} mm` }))}
                style={{ width: '100%' }}
              />
            ),
          },
        ]
      : []),
    {
      title: 'Material',
      key: 'material',
      render: (_: unknown, row: LocalRow) => (
        <Select
          size="small"
          showSearch
          optionFilterProp="label"
          value={row.material_id ?? undefined}
          onChange={(v) => patch(row._key, { material_id: v })}
          placeholder="Select material"
          options={materialOptions}
          style={{ width: '100%', minWidth: 200 }}
        />
      ),
    },
    {
      title: (
        <Tooltip title={isSteel ? 'Weight in MT per 1 bar × 1 m length (from IS:1200 / dia² / 162)' : 'Quantity of this material per 1 unit of BOQ measurement (e.g. 8.0 bags per m³ for M20 cement)'}>
          Coefficient <span style={{ fontSize: 10, opacity: 0.6 }}>(qty/unit)</span>
        </Tooltip>
      ),
      key: 'coeff',
      width: 130,
      render: (_: unknown, row: LocalRow) => (
        <InputNumber
          size="small"
          min={0.000001}
          step={0.001}
          value={row.coefficient ?? undefined}
          onChange={(v) => patch(row._key, { coefficient: v ?? null })}
          style={{ width: '100%' }}
          placeholder="e.g. 8.0"
        />
      ),
    },
    {
      title: 'UOM',
      key: 'uom',
      width: 130,
      render: (_: unknown, row: LocalRow) => (
        <Select
          size="small"
          showSearch
          optionFilterProp="label"
          value={row.uom_id ?? undefined}
          onChange={(v) => patch(row._key, { uom_id: v })}
          placeholder="Unit"
          options={uomOptions}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: `Rate (${symbol})`,
      key: 'rate',
      width: 110,
      render: (_: unknown, row: LocalRow) => (
        <InputNumber
          size="small"
          min={0}
          precision={2}
          value={row.rate ?? undefined}
          onChange={(v) => patch(row._key, { rate: v ?? null })}
          style={{ width: '100%' }}
          placeholder="Optional"
        />
      ),
    },
    {
      title: `Amt/unit (${symbol})`,
      key: 'amt',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, row: LocalRow) => {
        if (row.rate == null || row.coefficient == null) return <Typography.Text type="secondary">—</Typography.Text>;
        return <Typography.Text strong>{fmtAmt(row.coefficient * row.rate)}</Typography.Text>;
      },
    },
    {
      title: 'Notes',
      key: 'notes',
      render: (_: unknown, row: LocalRow) => (
        <Input
          size="small"
          value={row.notes}
          onChange={(e) => patch(row._key, { notes: e.target.value })}
          placeholder="Optional note"
        />
      ),
    },
    {
      title: '',
      key: 'del',
      width: 40,
      render: (_: unknown, row: LocalRow) => (
        <Popconfirm
          title="Remove this material?"
          onConfirm={() => removeRow(row._key)}
          okButtonProps={{ danger: true }}
        >
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ paddingTop: 8 }}>
      <Table<LocalRow>
        rowKey="_key"
        size="small"
        dataSource={rows}
        columns={columns}
        pagination={false}
        scroll={{ x: isSteel ? 900 : 800 }}
        locale={{ emptyText: 'No materials yet — click "Add Row" below.' }}
      />

      <Space style={{ marginTop: 10 }}>
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() =>
            setRows((prev) => [...prev, blankRow(prev.length)])
          }
        >
          Add Row
        </Button>
        <Button
          size="small"
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          onClick={handleSave}
          disabled={rows.length === 0}
        >
          Save Materials
        </Button>
      </Space>
    </div>
  );
}

// ── Template list per tab ─────────────────────────────────────────────────────

interface TemplatesTabProps {
  config: TypeConfig;
  isActive: boolean;
}

function TemplatesTab({ config, isActive }: TemplatesTabProps) {
  const { data: templates, isLoading } = useConstructionTemplates(isActive ? config.key : undefined);
  const createTemplate = useCreateConstructionTemplate();
  const updateTemplate = useUpdateConstructionTemplate();
  const deleteTemplate = useDeleteConstructionTemplate();

  const [addOpen, setAddOpen] = useState(false);
  const [editState, setEditState] = useState<{ open: boolean; template: BoqConstructionTemplateRead | null }>({
    open: false, template: null,
  });
  const [addForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const hasSubtype = !!config.subtypeOptions;
  const filtered = (templates ?? []).filter((t) => t.construction_type === config.key);

  const handleAdd = async (values: Record<string, unknown>) => {
    try {
      await createTemplate.mutateAsync({
        name: values.name as string,
        description: (values.description as string | null) || null,
        construction_type: config.key,
        construction_subtype: hasSubtype ? (values.construction_subtype as string ?? null) : null,
      });
      message.success('Template created — add materials below.');
      setAddOpen(false);
      addForm.resetFields();
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not create template'));
    }
  };

  const handleEdit = async (values: Record<string, unknown>) => {
    if (!editState.template) return;
    try {
      await updateTemplate.mutateAsync({
        id: editState.template.id,
        data: {
          name: values.name as string,
          description: (values.description as string | null) || null,
          is_active: values.is_active as boolean,
        },
      });
      message.success('Template updated');
      setEditState({ open: false, template: null });
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not update template'));
    }
  };

  const collapseItems = filtered.map((t) => ({
    key: t.id,
    label: (
      <Space>
        {t.construction_subtype && <Tag color="blue">{t.construction_subtype}</Tag>}
        <Typography.Text strong>{t.name}</Typography.Text>
        {t.description && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>— {t.description}</Typography.Text>
        )}
        <Tag style={{ marginLeft: 4 }}>
          {t.items.length} {t.items.length === 1 ? 'material' : 'materials'}
        </Tag>
        {!t.is_active && <Tag color="default">Inactive</Tag>}
      </Space>
    ),
    extra: (
      <Space size={4} onClick={(e) => e.stopPropagation()}>
        <Button
          size="small"
          type="text"
          icon={<EditOutlined />}
          onClick={() => {
            editForm.setFieldsValue({ name: t.name, description: t.description, is_active: t.is_active });
            setEditState({ open: true, template: t });
          }}
        />
        <Popconfirm
          title="Delete this template?"
          description="All material rows will also be removed. Existing measurements that used this template keep their auto-calculated materials."
          onConfirm={() => deleteTemplate.mutate(t.id)}
          okButtonProps={{ danger: true }}
        >
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    ),
    children: <ItemsEditor template={t} />,
  }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { addForm.resetFields(); setAddOpen(true); }}>
          New Template
        </Button>
      </div>

      {isLoading && <Skeleton active />}
      {!isLoading && filtered.length === 0 && (
        <Alert
          type="info"
          showIcon
          message={`No ${config.label} templates yet.`}
          description='Click "New Template" to create one, then expand it to add materials.'
          style={{ marginBottom: 12 }}
        />
      )}

      <Collapse
        items={collapseItems}
        bordered={false}
        style={{ background: 'transparent' }}
      />

      {/* Add modal */}
      <Modal
        title={`New ${config.label} Template`}
        open={addOpen}
        onCancel={() => setAddOpen(false)}
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
          <Form.Item
            name="name"
            label="Template Name"
            rules={[{ required: true, message: 'Name is required' }]}
            extra="e.g. M20 Nominal Mix – SOR 2023"
          >
            <Input placeholder="Descriptive name for this template" />
          </Form.Item>
          <Form.Item name="description" label="Description (optional)">
            <Input.TextArea rows={2} placeholder="e.g. IS 10262 nominal mix, slabs and beams" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit modal */}
      <Modal
        title={editState.template ? `Edit — ${editState.template.name}` : 'Edit Template'}
        open={editState.open}
        onCancel={() => setEditState({ open: false, template: null })}
        onOk={() => editForm.submit()}
        confirmLoading={updateTemplate.isPending}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item name="name" label="Template Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description (optional)">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="is_active" label="Status">
            <Select
              options={[
                { value: true, label: 'Active' },
                { value: false, label: 'Inactive' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ConstructionTemplatesPage() {
  const [activeTab, setActiveTab] = useState('CONCRETE');

  return (
    <div>
      <Space align="center" style={{ marginBottom: 4 }}>
        <SettingOutlined style={{ fontSize: 20 }} />
        <Typography.Title level={3} style={{ margin: 0 }}>
          Construction Material Templates
        </Typography.Title>
      </Space>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Each template is a named combination of materials for a construction type. When a
        measurement uses this template, its materials are auto-calculated and added to the DPR.
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
