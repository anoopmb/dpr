import { useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tabs, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { getApiErrorMessage } from '@/utils/api-error';
import {
  useCreateMaster,
  useDeleteMaster,
  useUpdateMaster,
  useDepartments,
  useExpenseCategories,
  useMachinery,
  useMaterials,
  useStockLocations,
  useUoms,
  useWorkTypes,
  useWorkerCategories,
  MACHINERY_HIRE_UNIT_LABELS,
  type MachineryHireUnit,
  type MachineryRow,
  type MaterialRow,
  type StockLocationRow,
  type WorkTypeRow,
  type WorkerCategoryRow,
} from '@/api/hooks/useMasters';
import { useProjects } from '@/api/hooks/useProjects';
import { SimpleCodeNameTab } from '@/features/masters/SimpleCodeNameTab';
import { useNumberFormat } from '@/utils/format';
import { useIsMobile } from '@/hooks/useIsMobile';

function fkError(err: unknown, label: string) {
  message.error(getApiErrorMessage(err, `Could not delete ${label}`));
}

interface WorkTypeFormValues {
  code: string;
  name: string;
  dimension_fields: string;
  formula: 'PRODUCT' | 'AREA_LH' | 'LENGTH_ONLY';
  output_uom_id: string;
}

interface WorkTypeCreateInput {
  code: string;
  name: string;
  dimension_fields: string[];
  formula: 'PRODUCT' | 'AREA_LH' | 'LENGTH_ONLY';
  output_uom_id: string;
}

function WorkTypesTab() {
  const isMobile = useIsMobile();
  const query = useWorkTypes();
  const { data: uoms } = useUoms();
  const createWorkType = useCreateMaster<WorkTypeRow, WorkTypeCreateInput>('work-types');
  const updateWorkType = useUpdateMaster<WorkTypeRow, Partial<WorkTypeCreateInput>>('work-types');
  const deleteWorkType = useDeleteMaster('work-types');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WorkTypeRow | null>(null);
  const [form] = Form.useForm<WorkTypeFormValues>();
  const [searchText, setSearchText] = useState('');

  const filteredData = (query.data ?? []).filter((row) => {
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return row.code.toLowerCase().includes(q) || row.name.toLowerCase().includes(q);
  });

  const openAdd = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (row: WorkTypeRow) => {
    setEditing(row);
    form.setFieldsValue({ code: row.code, name: row.name, dimension_fields: row.dimension_fields.join(', '), formula: row.formula, output_uom_id: row.output_uom_id });
    setModalOpen(true);
  };

  const handleSave = async (values: WorkTypeFormValues) => {
    const payload: WorkTypeCreateInput = { code: values.code, name: values.name, formula: values.formula, output_uom_id: values.output_uom_id, dimension_fields: values.dimension_fields.split(',').map((f) => f.trim()) };
    try {
      if (editing) {
        await updateWorkType.mutateAsync({ id: editing.id, data: payload });
        message.success('Work type updated');
      } else {
        await createWorkType.mutateAsync(payload);
        message.success('Work type added');
      }
      setModalOpen(false);
      form.resetFields();
    } catch (err) { message.error(getApiErrorMessage(err, 'Could not save work type')); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteWorkType.mutateAsync(id); message.success('Work type deleted'); }
    catch (err) { fkError(err, 'work type'); }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>{!isMobile && 'Add Work Type'}</Button>
        <Input.Search placeholder="Search by code or name" allowClear style={{ width: 280 }} value={searchText} onChange={(e) => setSearchText(e.target.value)} />
      </Space>
      <Table
        rowKey="id" loading={query.isLoading} dataSource={filteredData}
        pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['10', '25', '50', '100'], showTotal: (total) => `${total} records` }}
        scroll={{ x: 700 }}
        columns={[
          { title: 'Code', dataIndex: 'code', sorter: (a: WorkTypeRow, b: WorkTypeRow) => a.code.localeCompare(b.code) },
          { title: 'Name', dataIndex: 'name', sorter: (a: WorkTypeRow, b: WorkTypeRow) => a.name.localeCompare(b.name) },
          { title: 'Formula', dataIndex: 'formula', sorter: (a: WorkTypeRow, b: WorkTypeRow) => a.formula.localeCompare(b.formula) },
          { title: 'Dimension Fields', dataIndex: 'dimension_fields', render: (f: string[]) => f.join(', ') },
          {
            title: 'Actions', key: 'actions', width: 100,
            render: (_, row) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
                <Popconfirm title="Delete this work type?" description="This cannot be undone." onConfirm={() => handleDelete(row.id)} okText="Delete" okButtonProps={{ danger: true }}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal title={editing ? 'Edit Work Type' : 'Add Work Type'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} confirmLoading={createWorkType.isPending || updateWorkType.isPending} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="code" label="Code" rules={[{ required: true }]}><Input placeholder="EARTHWORK" /></Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="dimension_fields" label="Dimension Fields (comma-separated)" rules={[{ required: true }]}><Input placeholder="e.g. nos, l, b, d" /></Form.Item>
          <Form.Item name="formula" label="Formula" rules={[{ required: true }]}>
            <Select options={[{ value: 'PRODUCT', label: 'PRODUCT (multiply all dimensions)' }, { value: 'AREA_LH', label: 'AREA_LH (1st × 2nd dimension)' }, { value: 'LENGTH_ONLY', label: 'LENGTH_ONLY (billed by running length)' }]} />
          </Form.Item>
          <Form.Item name="output_uom_id" label="Output Unit" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(uoms ?? []).map((u) => ({ value: u.id, label: `${u.code} — ${u.name}` }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

interface MaterialFormValues {
  code: string;
  name: string;
  default_uom_id: string;
  category?: string;
  cost_rate?: number;
  cost_rate_unit?: string;
}

function MaterialsTab() {
  const isMobile = useIsMobile();
  const query = useMaterials();
  const { data: uoms } = useUoms();
  const { fmtAmt, symbol } = useNumberFormat();
  const createMaterial = useCreateMaster<MaterialRow, MaterialFormValues>('materials');
  const updateMaterial = useUpdateMaster<MaterialRow, Partial<MaterialFormValues>>('materials');
  const deleteMaterial = useDeleteMaster('materials');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialRow | null>(null);
  const [form] = Form.useForm<MaterialFormValues>();
  const [searchText, setSearchText] = useState('');

  const filteredData = (query.data ?? []).filter((row) => {
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return row.code.toLowerCase().includes(q) || row.name.toLowerCase().includes(q) || (row.category ?? '').toLowerCase().includes(q);
  });

  const openAdd = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (row: MaterialRow) => {
    setEditing(row);
    form.setFieldsValue({ code: row.code, name: row.name, default_uom_id: row.default_uom_id, category: row.category ?? undefined, cost_rate: row.cost_rate ? parseFloat(row.cost_rate) : undefined, cost_rate_unit: row.cost_rate_unit ?? undefined });
    setModalOpen(true);
  };

  const handleSave = async (values: MaterialFormValues) => {
    try {
      if (editing) {
        await updateMaterial.mutateAsync({ id: editing.id, data: values });
        message.success('Material updated');
      } else {
        await createMaterial.mutateAsync(values);
        message.success('Material added');
      }
      setModalOpen(false); form.resetFields();
    } catch (err) { message.error(getApiErrorMessage(err, 'Could not save material')); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteMaterial.mutateAsync(id); message.success('Material deleted'); }
    catch (err) { fkError(err, 'material'); }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>{!isMobile && 'Add Material'}</Button>
        <Input.Search placeholder="Search by code, name, or category" allowClear style={{ width: 280 }} value={searchText} onChange={(e) => setSearchText(e.target.value)} />
      </Space>
      <Table
        rowKey="id" loading={query.isLoading} dataSource={filteredData}
        pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['10', '25', '50', '100'], showTotal: (total) => `${total} records` }}
        scroll={{ x: 700 }}
        columns={[
          { title: 'Code', dataIndex: 'code', sorter: (a: MaterialRow, b: MaterialRow) => a.code.localeCompare(b.code) },
          { title: 'Name', dataIndex: 'name', sorter: (a: MaterialRow, b: MaterialRow) => a.name.localeCompare(b.name) },
          { title: 'Category', dataIndex: 'category', sorter: (a: MaterialRow, b: MaterialRow) => (a.category ?? '').localeCompare(b.category ?? '') },
          { title: 'Cost Rate', dataIndex: 'cost_rate', render: (v: string | null, row: MaterialRow) => v !== null ? `${fmtAmt(v)}${row.cost_rate_unit ? ` / ${row.cost_rate_unit}` : ''}` : '—' },
          {
            title: 'Actions', key: 'actions', width: 100,
            render: (_, row) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
                <Popconfirm title="Delete this material?" description="This cannot be undone." onConfirm={() => handleDelete(row.id)} okText="Delete" okButtonProps={{ danger: true }}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal title={editing ? 'Edit Material' : 'Add Material'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} confirmLoading={createMaterial.isPending || updateMaterial.isPending} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="code" label="Code" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="default_uom_id" label="Default Unit" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(uoms ?? []).map((u) => ({ value: u.id, label: `${u.code} — ${u.name}` }))} />
          </Form.Item>
          <Form.Item name="category" label="Category"><Input /></Form.Item>
          <Form.Item name="cost_rate" label={`Cost Rate (${symbol}, optional)`}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          <Form.Item name="cost_rate_unit" label="Cost Rate Unit (e.g. bag, Kg, Cum)"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

interface MachineryFormValues {
  code: string;
  name: string;
  hire_unit: MachineryHireUnit;
  hire_rate?: number;
}

const HIRE_UNIT_OPTIONS = (Object.keys(MACHINERY_HIRE_UNIT_LABELS) as MachineryHireUnit[]).map((k) => ({
  value: k,
  label: MACHINERY_HIRE_UNIT_LABELS[k],
}));

function MachineryTab() {
  const isMobile = useIsMobile();
  const query = useMachinery();
  const { fmtAmt, symbol } = useNumberFormat();
  const createMachinery = useCreateMaster<MachineryRow, MachineryFormValues>('machinery');
  const updateMachinery = useUpdateMaster<MachineryRow, Partial<MachineryFormValues>>('machinery');
  const deleteMachinery = useDeleteMaster('machinery');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MachineryRow | null>(null);
  const [form] = Form.useForm<MachineryFormValues>();
  const [watchedUnit, setWatchedUnit] = useState<MachineryHireUnit>('HOUR');
  const [searchText, setSearchText] = useState('');

  const filteredData = (query.data ?? []).filter((row) => {
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return row.code.toLowerCase().includes(q) || row.name.toLowerCase().includes(q);
  });

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldValue('hire_unit', 'HOUR');
    setWatchedUnit('HOUR');
    setModalOpen(true);
  };
  const openEdit = (row: MachineryRow) => {
    setEditing(row);
    form.setFieldsValue({
      code: row.code,
      name: row.name,
      hire_unit: row.hire_unit,
      hire_rate: row.hire_unit === 'OWNED' ? undefined : (row.hire_rate ? parseFloat(row.hire_rate) : undefined),
    });
    setWatchedUnit(row.hire_unit);
    setModalOpen(true);
  };

  const handleSave = async (values: MachineryFormValues) => {
    const payload = {
      ...values,
      hire_rate: values.hire_unit === 'OWNED' ? undefined : values.hire_rate,
    };
    try {
      if (editing) {
        await updateMachinery.mutateAsync({ id: editing.id, data: payload });
        message.success('Machinery updated');
      } else {
        await createMachinery.mutateAsync(payload);
        message.success('Machinery added');
      }
      setModalOpen(false); form.resetFields();
    } catch (err) { message.error(getApiErrorMessage(err, 'Could not save machinery')); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteMachinery.mutateAsync(id); message.success('Machinery deleted'); }
    catch (err) { fkError(err, 'machinery'); }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>{!isMobile && 'Add Machinery'}</Button>
        <Input.Search placeholder="Search by code or name" allowClear style={{ width: 280 }} value={searchText} onChange={(e) => setSearchText(e.target.value)} />
      </Space>
      <Table
        rowKey="id" loading={query.isLoading} dataSource={filteredData}
        pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['10', '25', '50', '100'], showTotal: (total) => `${total} records` }}
        scroll={{ x: 600 }}
        columns={[
          { title: 'Code', dataIndex: 'code', sorter: (a: MachineryRow, b: MachineryRow) => a.code.localeCompare(b.code) },
          { title: 'Name', dataIndex: 'name', sorter: (a: MachineryRow, b: MachineryRow) => a.name.localeCompare(b.name) },
          {
            title: 'Unit',
            dataIndex: 'hire_unit',
            width: 130,
            render: (v: MachineryHireUnit) => MACHINERY_HIRE_UNIT_LABELS[v] ?? v,
          },
          {
            title: 'Hire Rate',
            dataIndex: 'hire_rate',
            width: 130,
            render: (v: string | null, row: MachineryRow) =>
              row.hire_unit === 'OWNED' ? 'Owned' : (v ? fmtAmt(v) : '—'),
          },
          {
            title: 'Actions', key: 'actions', width: 100,
            render: (_: unknown, row: MachineryRow) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
                <Popconfirm title="Delete this machinery?" description="This cannot be undone." onConfirm={() => handleDelete(row.id)} okText="Delete" okButtonProps={{ danger: true }}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal title={editing ? 'Edit Machinery' : 'Add Machinery'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} confirmLoading={createMachinery.isPending || updateMachinery.isPending} destroyOnHidden>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          onValuesChange={(changed) => { if (changed.hire_unit) setWatchedUnit(changed.hire_unit); }}
          initialValues={{ hire_unit: 'HOUR' }}
        >
          <Form.Item name="code" label="Code" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="hire_unit" label="Billing Unit" rules={[{ required: true }]}>
            <Select options={HIRE_UNIT_OPTIONS} />
          </Form.Item>
          {watchedUnit !== 'OWNED' && (
            <Form.Item name="hire_rate" label={`Hire Rate (${symbol})`}>
              <InputNumber style={{ width: '100%' }} min={0} placeholder="Optional" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}

interface WorkerCategoryFormValues {
  code: string;
  name: string;
  daily_rate?: number;
}

function WorkerCategoryTab() {
  const isMobile = useIsMobile();
  const query = useWorkerCategories();
  const { fmtAmt, symbol } = useNumberFormat();
  const createWorkerCategory = useCreateMaster<WorkerCategoryRow, WorkerCategoryFormValues>('worker-categories');
  const updateWorkerCategory = useUpdateMaster<WorkerCategoryRow, Partial<WorkerCategoryFormValues>>('worker-categories');
  const deleteWorkerCategory = useDeleteMaster('worker-categories');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WorkerCategoryRow | null>(null);
  const [form] = Form.useForm<WorkerCategoryFormValues>();
  const [searchText, setSearchText] = useState('');

  const filteredData = (query.data ?? []).filter((row) => {
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return row.code.toLowerCase().includes(q) || row.name.toLowerCase().includes(q);
  });

  const openAdd = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (row: WorkerCategoryRow) => {
    setEditing(row);
    form.setFieldsValue({ code: row.code, name: row.name, daily_rate: row.daily_rate ? parseFloat(row.daily_rate) : undefined });
    setModalOpen(true);
  };

  const handleSave = async (values: WorkerCategoryFormValues) => {
    try {
      if (editing) {
        await updateWorkerCategory.mutateAsync({ id: editing.id, data: values });
        message.success('Worker category updated');
      } else {
        await createWorkerCategory.mutateAsync(values);
        message.success('Worker category added');
      }
      setModalOpen(false); form.resetFields();
    } catch (err) { message.error(getApiErrorMessage(err, 'Could not save worker category')); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteWorkerCategory.mutateAsync(id); message.success('Worker category deleted'); }
    catch (err) { fkError(err, 'worker category'); }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>{!isMobile && 'Add Worker Category'}</Button>
        <Input.Search placeholder="Search by code or name" allowClear style={{ width: 280 }} value={searchText} onChange={(e) => setSearchText(e.target.value)} />
      </Space>
      <Table
        rowKey="id" loading={query.isLoading} dataSource={filteredData}
        pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['10', '25', '50', '100'], showTotal: (total) => `${total} records` }}
        scroll={{ x: 550 }}
        columns={[
          { title: 'Code', dataIndex: 'code', sorter: (a: WorkerCategoryRow, b: WorkerCategoryRow) => a.code.localeCompare(b.code) },
          { title: 'Name', dataIndex: 'name', sorter: (a: WorkerCategoryRow, b: WorkerCategoryRow) => a.name.localeCompare(b.name) },
          { title: 'Daily Rate', dataIndex: 'daily_rate', render: (v: string | null) => fmtAmt(v) },
          {
            title: 'Actions', key: 'actions', width: 100,
            render: (_, row) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
                <Popconfirm title="Delete this worker category?" description="This cannot be undone." onConfirm={() => handleDelete(row.id)} okText="Delete" okButtonProps={{ danger: true }}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal title={editing ? 'Edit Worker Category' : 'Add Worker Category'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} confirmLoading={createWorkerCategory.isPending || updateWorkerCategory.isPending} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="code" label="Code" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="daily_rate" label={`Daily Rate (${symbol}, optional)`}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

interface StockLocationFormValues {
  name: string;
  location_type: 'HEAD_OFFICE' | 'SITE';
  project_id?: string;
}

interface StockLocationCreateInput {
  name: string;
  location_type: 'HEAD_OFFICE' | 'SITE';
  project_id: string | null;
}

function StockLocationsTab() {
  const isMobile = useIsMobile();
  const query = useStockLocations();
  const { data: projects } = useProjects();
  const createLocation = useCreateMaster<StockLocationRow, StockLocationCreateInput>('stock-locations');
  const updateLocation = useUpdateMaster<StockLocationRow, Partial<StockLocationCreateInput>>('stock-locations');
  const deleteLocation = useDeleteMaster('stock-locations');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StockLocationRow | null>(null);
  const [form] = Form.useForm<StockLocationFormValues>();
  const [searchText, setSearchText] = useState('');

  const filteredData = (query.data ?? []).filter((row) => {
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return row.name.toLowerCase().includes(q);
  });

  const openAdd = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (row: StockLocationRow) => {
    setEditing(row);
    form.setFieldsValue({ name: row.name, location_type: row.location_type, project_id: row.project_id ?? undefined });
    setModalOpen(true);
  };

  const handleSave = async (values: StockLocationFormValues) => {
    try {
      const payload: StockLocationCreateInput = { name: values.name, location_type: values.location_type, project_id: values.location_type === 'SITE' ? values.project_id ?? null : null };
      if (editing) {
        await updateLocation.mutateAsync({ id: editing.id, data: payload });
        message.success('Stock location updated');
      } else {
        await createLocation.mutateAsync(payload);
        message.success('Stock location added');
      }
      setModalOpen(false); form.resetFields();
    } catch (err) { message.error(getApiErrorMessage(err, 'Could not save stock location')); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteLocation.mutateAsync(id); message.success('Stock location deleted'); }
    catch (err) { fkError(err, 'stock location'); }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>{!isMobile && 'Add Stock Location'}</Button>
        <Input.Search placeholder="Search by name" allowClear style={{ width: 280 }} value={searchText} onChange={(e) => setSearchText(e.target.value)} />
      </Space>
      <Table
        rowKey="id" loading={query.isLoading} dataSource={filteredData}
        pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['10', '25', '50', '100'], showTotal: (total) => `${total} records` }}
        scroll={{ x: 450 }}
        columns={[
          { title: 'Name', dataIndex: 'name', sorter: (a: StockLocationRow, b: StockLocationRow) => a.name.localeCompare(b.name) },
          { title: 'Type', dataIndex: 'location_type', sorter: (a: StockLocationRow, b: StockLocationRow) => a.location_type.localeCompare(b.location_type), render: (v: string) => v === 'HEAD_OFFICE' ? 'Head Office' : 'Site' },
          {
            title: 'Actions', key: 'actions', width: 100,
            render: (_, row) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
                <Popconfirm title="Delete this stock location?" description="This cannot be undone." onConfirm={() => handleDelete(row.id)} okText="Delete" okButtonProps={{ danger: true }}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal title={editing ? 'Edit Stock Location' : 'Add Stock Location'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} confirmLoading={createLocation.isPending || updateLocation.isPending} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="location_type" label="Type" rules={[{ required: true }]}>
            <Select options={[{ value: 'HEAD_OFFICE', label: 'Head Office Store' }, { value: 'SITE', label: 'Site Store' }]} />
          </Form.Item>
          <Form.Item name="project_id" label="Project (required for Site)">
            <Select showSearch optionFilterProp="label" options={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))} allowClear />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export function MastersPage() {
  const departments = useDepartments();
  const uoms = useUoms();
  const expenseCategories = useExpenseCategories();

  return (
    <div>
      <Typography.Title level={3}>Master Data</Typography.Title>
      <Tabs
        items={[
          { key: 'departments', label: 'Departments', children: <SimpleCodeNameTab apiPath="departments" query={departments} label="Department" /> },
          {
            key: 'uoms',
            label: 'Units of Measure',
            children: (
              <SimpleCodeNameTab
                apiPath="uoms"
                query={uoms}
                label="Unit"
                extraField={{ name: 'decimal_places', label: 'Qty Decimal Places', min: 0, max: 4, defaultValue: 3 }}
              />
            ),
          },
          { key: 'work-types', label: 'Work Types', children: <WorkTypesTab /> },
          { key: 'materials', label: 'Materials', children: <MaterialsTab /> },
          { key: 'machinery', label: 'Machinery', children: <MachineryTab /> },
          { key: 'worker-categories', label: 'Worker Categories', children: <WorkerCategoryTab /> },
          { key: 'expense-categories', label: 'Expense Categories', children: <SimpleCodeNameTab apiPath="expense-categories" query={expenseCategories} label="Expense Category" /> },
          { key: 'stock-locations', label: 'Stock Locations', children: <StockLocationsTab /> },
        ]}
      />
    </div>
  );
}
