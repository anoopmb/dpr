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
  Tag,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import {
  useBoqSections,
  useCreateBoqItem,
  useCreateBoqSection,
  useDeleteBoqItem,
  useDeleteBoqSection,
  useUpdateBoqItem,
  useUpdateBoqSection,
  type BoqItemRead,
  type BoqSectionRead,
} from '@/api/hooks/useBoq';
import { useUoms, useWorkTypes } from '@/api/hooks/useMasters';

type RowType =
  | { _type: 'header'; section: BoqSectionRead; key: string }
  | { _type: 'item'; item: BoqItemRead; key: string }
  | { _type: 'subtotal'; section: BoqSectionRead; key: string };

const SECTION_HEADER_BG = '#f0f5ff';
const SUBTOTAL_BG = '#fafafa';

function fmtAmt(qty: string, rate: string): string {
  const v = parseFloat(qty) * parseFloat(rate);
  return v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function sectionAmount(items: BoqItemRead[], field: 'tendered_qty' | 'consumed_qty'): string {
  const total = items.reduce((acc, i) => acc + parseFloat(i[field]) * parseFloat(i.rate), 0);
  return total.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

interface ItemFormValues {
  section_id: string | null;
  item_no: string;
  description: string;
  work_type_id: string;
  uom_id: string;
  tendered_qty: number;
  rate: number;
}

interface SectionFormValues {
  section_no: string;
  section_name: string;
  sort_order: number;
}

export function BoqPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: sections, isLoading } = useBoqSections(selectedProjectId);
  const { data: workTypes } = useWorkTypes();
  const { data: uoms } = useUoms();
  const createItem = useCreateBoqItem();
  const updateItem = useUpdateBoqItem();
  const deleteItem = useDeleteBoqItem();
  const createSection = useCreateBoqSection();
  const updateSection = useUpdateBoqSection();
  const deleteSection = useDeleteBoqSection();

  const [itemModal, setItemModal] = useState<{ open: boolean; defaultSectionId?: string }>({ open: false });
  const [editItemModal, setEditItemModal] = useState<{ open: boolean; item?: BoqItemRead }>({ open: false });
  const [sectionModal, setSectionModal] = useState<{ open: boolean; editing?: BoqSectionRead }>({ open: false });
  const [itemForm] = Form.useForm<ItemFormValues>();
  const [editItemForm] = Form.useForm<ItemFormValues>();
  const [sectionForm] = Form.useForm<SectionFormValues>();

  const workTypeById = new Map((workTypes ?? []).map((w) => [w.id, w.name]));
  const uomById = new Map((uoms ?? []).map((u) => [u.id, u.code]));

  const openAddItem = (sectionId?: string) => {
    itemForm.resetFields();
    if (sectionId) itemForm.setFieldValue('section_id', sectionId);
    setItemModal({ open: true, defaultSectionId: sectionId });
  };

  const openAddSection = () => {
    sectionForm.resetFields();
    sectionForm.setFieldValue('sort_order', (sections ?? []).length);
    setSectionModal({ open: false });
    setTimeout(() => setSectionModal({ open: true }), 0);
  };

  const openEditSection = (section: BoqSectionRead) => {
    sectionForm.setFieldsValue({
      section_no: section.section_no,
      section_name: section.section_name,
      sort_order: section.sort_order,
    });
    setSectionModal({ open: true, editing: section });
  };

  const handleCreateItem = async (values: ItemFormValues) => {
    if (!selectedProjectId) return;
    try {
      await createItem.mutateAsync({
        project_id: selectedProjectId,
        section_id: values.section_id ?? null,
        work_type_id: values.work_type_id,
        uom_id: values.uom_id,
        item_no: values.item_no,
        description: values.description,
        tendered_qty: String(values.tendered_qty),
        rate: String(values.rate),
      });
      message.success('BOQ item added');
      setItemModal({ open: false });
    } catch {
      message.error('Could not add BOQ item');
    }
  };

  const handleSaveSection = async (values: SectionFormValues) => {
    if (!selectedProjectId) return;
    try {
      if (sectionModal.editing) {
        await updateSection.mutateAsync({ id: sectionModal.editing.id, data: values });
        message.success('Section updated');
      } else {
        await createSection.mutateAsync({ project_id: selectedProjectId, ...values });
        message.success('Section created');
      }
      setSectionModal({ open: false });
    } catch {
      message.error('Could not save section');
    }
  };

  const handleDeleteSection = async (section: BoqSectionRead) => {
    try {
      await deleteSection.mutateAsync({ id: section.id, projectId: section.project_id });
      message.success('Section deleted');
    } catch {
      message.error('Cannot delete section — reassign its items first');
    }
  };

  const openEditItem = (item: BoqItemRead) => {
    editItemForm.setFieldsValue({
      section_id: item.section_id,
      item_no: item.item_no,
      description: item.description,
      work_type_id: item.work_type_id,
      uom_id: item.uom_id,
      tendered_qty: parseFloat(item.tendered_qty),
      rate: parseFloat(item.rate),
    });
    setEditItemModal({ open: true, item });
  };

  const handleEditItem = async (values: ItemFormValues) => {
    if (!editItemModal.item) return;
    try {
      await updateItem.mutateAsync({
        id: editItemModal.item.id,
        data: {
          section_id: values.section_id ?? null,
          item_no: values.item_no,
          description: values.description,
          work_type_id: values.work_type_id,
          uom_id: values.uom_id,
          tendered_qty: String(values.tendered_qty),
          rate: String(values.rate),
        },
      });
      message.success('BOQ item updated');
      setEditItemModal({ open: false });
    } catch {
      message.error('Could not update BOQ item');
    }
  };

  const handleDeleteItem = async (item: BoqItemRead) => {
    try {
      await deleteItem.mutateAsync({ id: item.id, projectId: item.project_id });
      message.success('BOQ item deleted');
    } catch {
      message.error('Cannot delete — this item has recorded measurements against it.');
    }
  };

  const tableRows: RowType[] = [];
  for (const section of sections ?? []) {
    tableRows.push({ _type: 'header', section, key: `hdr-${section.id}` });
    for (const item of section.items) {
      tableRows.push({ _type: 'item', item, key: item.id });
    }
    tableRows.push({ _type: 'subtotal', section, key: `sub-${section.id}` });
  }

  const NCOLS = 9;
  const columns: TableColumnsType<RowType> = [
    {
      title: 'Item No',
      key: 'item_no',
      width: 90,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: NCOLS, style: { background: SECTION_HEADER_BG, padding: '6px 12px' } };
        if (row._type === 'subtotal') return { colSpan: 4, style: { background: SUBTOTAL_BG, fontWeight: 600 } };
        return {};
      },
      render: (_, row) => {
        if (row._type === 'header') {
          return (
            <Space>
              <Typography.Text strong style={{ fontSize: 13 }}>
                {row.section.section_no}. {row.section.section_name.toUpperCase()}
              </Typography.Text>
              <Tag color="blue" style={{ marginLeft: 8 }}>
                {row.section.items.length} items
              </Tag>
              <Button size="small" icon={<PlusOutlined />} onClick={() => openAddItem(row.section.id)}>
                Add Item
              </Button>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditSection(row.section)} />
              <Popconfirm
                title="Delete this section? All items must be reassigned first."
                onConfirm={() => handleDeleteSection(row.section)}
                okText="Delete"
                okButtonProps={{ danger: true }}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          );
        }
        if (row._type === 'subtotal') return 'Section Total';
        return row.item.item_no;
      },
    },
    {
      title: 'Description',
      key: 'description',
      ellipsis: true,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { colSpan: 0 };
        return {};
      },
      render: (_, row) => (row._type === 'item' ? row.item.description : null),
    },
    {
      title: 'Work Type',
      key: 'work_type',
      width: 120,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { colSpan: 0 };
        return {};
      },
      render: (_, row) =>
        row._type === 'item' ? (workTypeById.get(row.item.work_type_id) ?? '—') : null,
    },
    {
      title: 'Unit',
      key: 'unit',
      width: 70,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { colSpan: 0 };
        return {};
      },
      render: (_, row) =>
        row._type === 'item' ? (uomById.get(row.item.uom_id) ?? '—') : null,
    },
    {
      title: 'Tendered Qty',
      key: 'tendered_qty',
      width: 110,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { style: { background: SUBTOTAL_BG, fontWeight: 600, textAlign: 'right' } };
        return {};
      },
      render: (_, row) => {
        if (row._type === 'item') return parseFloat(row.item.tendered_qty).toLocaleString('en-IN', { maximumFractionDigits: 3 });
        if (row._type === 'subtotal') return `₹ ${sectionAmount(row.section.items, 'tendered_qty')}`;
        return null;
      },
    },
    {
      title: 'Consumed Qty',
      key: 'consumed_qty',
      width: 110,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { style: { background: SUBTOTAL_BG, fontWeight: 600, textAlign: 'right' } };
        return {};
      },
      render: (_, row) => {
        if (row._type === 'item') return parseFloat(row.item.consumed_qty).toLocaleString('en-IN', { maximumFractionDigits: 3 });
        if (row._type === 'subtotal') return `₹ ${sectionAmount(row.section.items, 'consumed_qty')}`;
        return null;
      },
    },
    {
      title: 'Rate (₹)',
      key: 'rate',
      width: 90,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { colSpan: 0, style: { background: SUBTOTAL_BG } };
        return {};
      },
      render: (_, row) =>
        row._type === 'item'
          ? parseFloat(row.item.rate).toLocaleString('en-IN', { maximumFractionDigits: 2 })
          : null,
    },
    {
      title: 'Tendered Value (₹)',
      key: 'tendered_value',
      width: 130,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { colSpan: 0, style: { background: SUBTOTAL_BG } };
        return {};
      },
      render: (_, row) =>
        row._type === 'item' ? fmtAmt(row.item.tendered_qty, row.item.rate) : null,
    },
    {
      title: 'Actions',
      key: 'item_actions',
      width: 90,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { colSpan: 0, style: { background: SUBTOTAL_BG } };
        return {};
      },
      render: (_, row) => {
        if (row._type !== 'item') return null;
        return (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditItem(row.item)} />
            <Popconfirm
              title="Delete this BOQ item?"
              description="Only items with no recorded measurements can be deleted."
              onConfirm={() => handleDeleteItem(row.item)}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  const sectionOptions = (sections ?? []).map((s) => ({
    value: s.id,
    label: `${s.section_no}. ${s.section_name}`,
  }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          BOQ & Approved Quantities
        </Typography.Title>
        <Space wrap>
          <ProjectSelector />
          <Button
            icon={<PlusOutlined />}
            disabled={!selectedProjectId}
            onClick={openAddSection}
          >
            Add Section
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!selectedProjectId}
            onClick={() => openAddItem()}
          >
            Add BOQ Item
          </Button>
        </Space>
      </div>

      {selectedProjectId && (sections ?? []).length === 0 && !isLoading && (
        <Typography.Text type="secondary">
          No sections yet. Create a section first, then add BOQ items to it.
        </Typography.Text>
      )}

      <Table
        rowKey="key"
        loading={isLoading}
        dataSource={tableRows}
        columns={columns}
        pagination={false}
        bordered
        size="small"
        onRow={(row) => ({
          style: {
            background:
              row._type === 'header'
                ? SECTION_HEADER_BG
                : row._type === 'subtotal'
                  ? SUBTOTAL_BG
                  : undefined,
          },
        })}
      />

      <Modal
        title={sectionModal.editing ? 'Edit Section' : 'New BOQ Section'}
        open={sectionModal.open}
        onCancel={() => setSectionModal({ open: false })}
        onOk={() => sectionForm.submit()}
        confirmLoading={createSection.isPending || updateSection.isPending}
        destroyOnHidden
      >
        <Form form={sectionForm} layout="vertical" onFinish={handleSaveSection}>
          <Form.Item name="section_no" label="Section No" rules={[{ required: true, max: 10 }]}>
            <Input placeholder="e.g. 1" />
          </Form.Item>
          <Form.Item name="section_name" label="Section Name" rules={[{ required: true, max: 200 }]}>
            <Input placeholder="e.g. ROAD WORKS" />
          </Form.Item>
          <Form.Item name="sort_order" label="Sort Order" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Add BOQ Item"
        open={itemModal.open}
        onCancel={() => setItemModal({ open: false })}
        onOk={() => itemForm.submit()}
        confirmLoading={createItem.isPending}
        destroyOnHidden
      >
        <Form form={itemForm} layout="vertical" onFinish={handleCreateItem}>
          <Form.Item name="section_id" label="Section">
            <Select
              allowClear
              placeholder="Select section (optional)"
              options={sectionOptions}
            />
          </Form.Item>
          <Form.Item name="item_no" label="Item No" rules={[{ required: true }]}>
            <Input placeholder="e.g. 1.005" />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="work_type_id" label="Work Type" rules={[{ required: true }]}>
            <Select options={(workTypes ?? []).map((w) => ({ value: w.id, label: w.name }))} />
          </Form.Item>
          <Form.Item name="uom_id" label="Unit of Measure" rules={[{ required: true }]}>
            <Select options={(uoms ?? []).map((u) => ({ value: u.id, label: `${u.code} — ${u.name}` }))} />
          </Form.Item>
          <Form.Item name="tendered_qty" label="Tendered Quantity" rules={[{ required: true }]}>
            <InputNumber min={0.001} step={0.001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="rate" label="Rate (₹)" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit BOQ Item"
        open={editItemModal.open}
        onCancel={() => setEditItemModal({ open: false })}
        onOk={() => editItemForm.submit()}
        confirmLoading={updateItem.isPending}
        destroyOnHidden
      >
        <Form form={editItemForm} layout="vertical" onFinish={handleEditItem}>
          <Form.Item name="section_id" label="Section">
            <Select allowClear placeholder="Select section (optional)" options={sectionOptions} />
          </Form.Item>
          <Form.Item name="item_no" label="Item No" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="work_type_id" label="Work Type" rules={[{ required: true }]}>
            <Select options={(workTypes ?? []).map((w) => ({ value: w.id, label: w.name }))} />
          </Form.Item>
          <Form.Item name="uom_id" label="Unit of Measure" rules={[{ required: true }]}>
            <Select options={(uoms ?? []).map((u) => ({ value: u.id, label: `${u.code} — ${u.name}` }))} />
          </Form.Item>
          <Form.Item name="tendered_qty" label="Tendered Quantity" rules={[{ required: true }]}>
            <InputNumber min={0.001} step={0.001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="rate" label="Rate (₹)" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
