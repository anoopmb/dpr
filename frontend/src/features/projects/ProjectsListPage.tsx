import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { AimOutlined, EditOutlined, PlusOutlined, SettingOutlined, TeamOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useCreateProject, useProjects, useUpdateProject, type ProjectRead } from '@/api/hooks/useProjects';
import { GeofenceMapPicker } from '@/components/common/GeofenceMapPicker';
import { getCurrentPosition } from '@/utils/geolocation';
import { useDepartments } from '@/api/hooks/useMasters';
import { useUsers } from '@/api/hooks/useUsers';
import {
  useCreateProjectAssignment,
  useDeleteProjectAssignment,
  useProjectAssignments,
} from '@/api/hooks/useProjectAssignments';
import type { UserRole } from '@/store/auth-store';

const STATUS_COLOR: Record<string, string> = { ACTIVE: 'green', COMPLETED: 'blue', SUSPENDED: 'orange' };

const ASSIGNABLE_ROLES: { value: UserRole; label: string }[] = [
  { value: 'PROJECT_MANAGER', label: 'Project Manager' },
  { value: 'SITE_ENGINEER', label: 'Site Engineer' },
  { value: 'QUANTITY_SURVEYOR', label: 'Quantity Surveyor' },
  { value: 'STORE_KEEPER', label: 'Store Keeper' },
];

interface ProjectFormValues {
  department_id: string;
  name: string;
  tender_no: string;
  agreement_no?: string;
  contract_value: number;
  start_date: Dayjs;
  completion_date: Dayjs;
  attendance_verification_required: boolean;
}

interface ProjectEditFormValues {
  name: string;
  agreement_no?: string;
  contract_value: number;
  completion_date: Dayjs;
  status: ProjectRead['status'];
}

function AssignmentsModal({ project, onClose }: { project: ProjectRead; onClose: () => void }) {
  const { data: users } = useUsers();
  const { data: assignments } = useProjectAssignments(project.id);
  const createAssignment = useCreateProjectAssignment();
  const deleteAssignment = useDeleteProjectAssignment();
  const updateProject = useUpdateProject();

  const [role, setRole] = useState<UserRole>('PROJECT_MANAGER');
  const [userId, setUserId] = useState<string | undefined>(undefined);

  const usersForRole = (r: UserRole) => (users ?? []).filter((u) => u.role === r);
  const userName = (id: string) => (users ?? []).find((u) => u.id === id)?.full_name ?? id;

  const handleAdd = async () => {
    if (!userId) return;
    try {
      await createAssignment.mutateAsync({ projectId: project.id, user_id: userId, role });
      message.success('Assignment added');
      setUserId(undefined);
    } catch {
      message.error('Could not add assignment — this user may already be assigned to this role');
    }
  };

  const handleRemove = async (assignmentId: string) => {
    try {
      await deleteAssignment.mutateAsync({ projectId: project.id, assignmentId });
      message.success('Assignment removed');
    } catch {
      message.error('Could not remove assignment');
    }
  };

  const handlePrimaryChange = async (field: 'project_manager_id' | 'site_engineer_id', value: string | null) => {
    try {
      await updateProject.mutateAsync({ id: project.id, data: { [field]: value } });
      message.success('Updated');
    } catch {
      message.error('Could not update');
    }
  };

  return (
    <Modal title={`Assignments — ${project.name}`} open onCancel={onClose} footer={null} width={560}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <div>
          <Typography.Text strong>Primary Project Manager</Typography.Text>
          <Select
            allowClear
            style={{ width: '100%', marginTop: 4 }}
            value={project.project_manager_id ?? undefined}
            onChange={(v) => handlePrimaryChange('project_manager_id', v ?? null)}
            options={usersForRole('PROJECT_MANAGER').map((u) => ({ value: u.id, label: u.full_name }))}
            placeholder="Not assigned"
          />
        </div>
        <div>
          <Typography.Text strong>Primary Site Engineer</Typography.Text>
          <Select
            allowClear
            style={{ width: '100%', marginTop: 4 }}
            value={project.site_engineer_id ?? undefined}
            onChange={(v) => handlePrimaryChange('site_engineer_id', v ?? null)}
            options={usersForRole('SITE_ENGINEER').map((u) => ({ value: u.id, label: u.full_name }))}
            placeholder="Not assigned"
          />
        </div>

        <div>
          <Typography.Text strong>Additional Assignments</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
            Quantity Surveyors and Store Keepers, plus any extra Project Managers or Site Engineers beyond the
            primary one above.
          </Typography.Paragraph>
          <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
            <Select value={role} onChange={setRole} options={ASSIGNABLE_ROLES} style={{ width: 180 }} />
            <Select
              value={userId}
              onChange={setUserId}
              options={usersForRole(role).map((u) => ({ value: u.id, label: u.full_name }))}
              style={{ width: '100%' }}
              placeholder="Select user"
            />
            <Button type="primary" onClick={handleAdd} loading={createAssignment.isPending}>
              Add
            </Button>
          </Space.Compact>
          {(assignments ?? []).length === 0 ? (
            <Empty description="No additional assignments" />
          ) : (
            <List
              size="small"
              bordered
              dataSource={assignments ?? []}
              renderItem={(a) => (
                <List.Item
                  actions={[
                    <Button key="remove" size="small" danger onClick={() => handleRemove(a.id)}>
                      Remove
                    </Button>,
                  ]}
                >
                  <Tag>{ASSIGNABLE_ROLES.find((r) => r.value === a.role)?.label ?? a.role}</Tag>
                  {userName(a.user_id)}
                </List.Item>
              )}
            />
          )}
        </div>
      </Space>
    </Modal>
  );
}

function ProjectSettingsDrawer({ project, onClose }: { project: ProjectRead; onClose: () => void }) {
  const updateProject = useUpdateProject();

  const [geoLat, setGeoLat] = useState<number | null>(
    project.site_latitude != null ? parseFloat(project.site_latitude) : null,
  );
  const [geoLng, setGeoLng] = useState<number | null>(
    project.site_longitude != null ? parseFloat(project.site_longitude) : null,
  );
  const [geoRadius, setGeoRadius] = useState<number>(project.geofence_radius_meters ?? 500);
  const [locatingMe, setLocatingMe] = useState(false);

  const handleToggle = async (checked: boolean) => {
    try {
      await updateProject.mutateAsync({ id: project.id, data: { attendance_verification_required: checked } });
      message.success('Setting updated');
    } catch {
      message.error('Could not update setting');
    }
  };

  const handleUseMyLocation = async () => {
    setLocatingMe(true);
    try {
      const pos = await getCurrentPosition();
      setGeoLat(pos.latitude);
      setGeoLng(pos.longitude);
    } catch {
      message.error('Could not get GPS location');
    } finally {
      setLocatingMe(false);
    }
  };

  const handleSaveGeofence = async () => {
    try {
      await updateProject.mutateAsync({ id: project.id, data: { site_latitude: geoLat, site_longitude: geoLng, geofence_radius_meters: geoRadius } });
      message.success('Site boundary saved');
    } catch {
      message.error('Could not save boundary');
    }
  };

  return (
    <Drawer title={`Project Settings — ${project.name}`} open onClose={onClose} width={560} destroyOnHidden>
      <Card title="Attendance" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
          <div>
            <Typography.Text strong>Require photo + GPS verification</Typography.Text>
            <br />
            <Typography.Text type="secondary">
              <b>On (default):</b> every check-in needs a captured photo and GPS fix.<br />
              <b>Off:</b> supervisors can mark all workers present in bulk with no photo/GPS.
            </Typography.Text>
          </div>
          <Switch checked={project.attendance_verification_required} loading={updateProject.isPending} onChange={handleToggle} />
        </div>
      </Card>

      <Divider />

      <Card title="Site Boundary (Geofence)" style={{ marginBottom: 16 }}>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Click on the map or drag the marker to set the site centre. Check-ins outside the radius are
          <b> flagged but not blocked</b>.
        </Typography.Text>
        <GeofenceMapPicker
          latitude={geoLat}
          longitude={geoLng}
          radiusMeters={geoRadius}
          onChange={(lat, lng) => { setGeoLat(lat); setGeoLng(lng); }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px', marginTop: 12 }}>
          <Form.Item label="Latitude">
            <InputNumber style={{ width: '100%' }} value={geoLat ?? undefined} precision={6} min={-90} max={90} onChange={(v) => setGeoLat(v ?? null)} />
          </Form.Item>
          <Form.Item label="Longitude">
            <InputNumber style={{ width: '100%' }} value={geoLng ?? undefined} precision={6} min={-180} max={180} onChange={(v) => setGeoLng(v ?? null)} />
          </Form.Item>
          <Form.Item label="Radius (m)">
            <InputNumber style={{ width: '100%' }} value={geoRadius} min={50} max={100000} step={50} onChange={(v) => setGeoRadius(v ?? 500)} />
          </Form.Item>
        </div>
        <Space>
          <Button icon={<AimOutlined />} loading={locatingMe} onClick={handleUseMyLocation}>Use My Location</Button>
          <Button type="primary" loading={updateProject.isPending} disabled={geoLat == null || geoLng == null} onClick={handleSaveGeofence}>Save Boundary</Button>
        </Space>
        {geoLat == null && (
          <Alert type="info" showIcon style={{ marginTop: 12 }} message="No site coordinates set yet. Click the map or use your current location." />
        )}
      </Card>
    </Drawer>
  );
}

export function ProjectsListPage() {
  const { data: projects, isLoading } = useProjects();
  const { data: departments } = useDepartments();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectRead | null>(null);
  const [settingsProject, setSettingsProject] = useState<ProjectRead | null>(null);
  const [form] = Form.useForm<ProjectFormValues>();
  const [editForm] = Form.useForm<ProjectEditFormValues>();
  const [assignmentsProject, setAssignmentsProject] = useState<ProjectRead | null>(null);

  const handleCreate = async (values: ProjectFormValues) => {
    try {
      await createProject.mutateAsync({
        department_id: values.department_id,
        name: values.name,
        tender_no: values.tender_no,
        agreement_no: values.agreement_no,
        contract_value: String(values.contract_value),
        start_date: values.start_date.format('YYYY-MM-DD'),
        completion_date: values.completion_date.format('YYYY-MM-DD'),
        attendance_verification_required: values.attendance_verification_required,
      });
      message.success('Project created');
      setModalOpen(false);
      form.resetFields();
    } catch {
      message.error('Could not create project');
    }
  };

  const openEdit = (project: ProjectRead) => {
    setEditingProject(project);
    editForm.setFieldsValue({
      name: project.name,
      agreement_no: project.agreement_no ?? undefined,
      contract_value: parseFloat(project.contract_value),
      completion_date: dayjs(project.completion_date),
      status: project.status,
    });
  };

  const handleEdit = async (values: ProjectEditFormValues) => {
    if (!editingProject) return;
    try {
      await updateProject.mutateAsync({
        id: editingProject.id,
        data: {
          name: values.name,
          agreement_no: values.agreement_no,
          contract_value: String(values.contract_value),
          completion_date: values.completion_date.format('YYYY-MM-DD'),
          status: values.status,
        },
      });
      message.success('Project updated');
      setEditingProject(null);
      editForm.resetFields();
    } catch {
      message.error('Could not update project');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Projects
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          New Project
        </Button>
      </div>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={projects ?? []}
        pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: ['10', '25', '50'], showTotal: (total) => `${total} projects` }}
        columns={[
          { title: 'Tender No', dataIndex: 'tender_no', sorter: (a: ProjectRead, b: ProjectRead) => a.tender_no.localeCompare(b.tender_no) },
          { title: 'Name', dataIndex: 'name', sorter: (a: ProjectRead, b: ProjectRead) => a.name.localeCompare(b.name), defaultSortOrder: 'ascend' as const },
          { title: 'Contract Value', dataIndex: 'contract_value', sorter: (a: ProjectRead, b: ProjectRead) => parseFloat(a.contract_value) - parseFloat(b.contract_value) },
          { title: 'Start', dataIndex: 'start_date', sorter: (a: ProjectRead, b: ProjectRead) => a.start_date.localeCompare(b.start_date) },
          { title: 'Completion', dataIndex: 'completion_date', sorter: (a: ProjectRead, b: ProjectRead) => a.completion_date.localeCompare(b.completion_date) },
          {
            title: 'Status',
            dataIndex: 'status',
            sorter: (a: ProjectRead, b: ProjectRead) => a.status.localeCompare(b.status),
            render: (status: string) => <Tag color={STATUS_COLOR[status]}>{status}</Tag>,
          },
          {
            title: 'Actions',
            key: 'actions',
            width: 150,
            render: (_, project: ProjectRead) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(project)} />
                <Button size="small" icon={<SettingOutlined />} onClick={() => setSettingsProject(project)} />
                <Button size="small" icon={<TeamOutlined />} onClick={() => setAssignmentsProject(project)}>
                  Assign
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="New Project"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createProject.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} initialValues={{ attendance_verification_required: true }}>
          <Form.Item name="department_id" label="Department" rules={[{ required: true }]}>
            <Select options={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))} />
          </Form.Item>
          <Form.Item name="name" label="Project Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="tender_no" label="Tender No" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="agreement_no" label="Agreement No">
            <Input />
          </Form.Item>
          <Form.Item name="contract_value" label="Contract Value" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="start_date"
            label="Start Date"
            rules={[{ required: true }]}
            initialValue={dayjs()}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="completion_date"
            label="Completion Date"
            rules={[{ required: true }]}
            initialValue={dayjs().add(1, 'year')}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="attendance_verification_required" label="Require photo + GPS for attendance" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit Project"
        open={!!editingProject}
        onCancel={() => setEditingProject(null)}
        onOk={() => editForm.submit()}
        confirmLoading={updateProject.isPending}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item name="name" label="Project Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="agreement_no" label="Agreement No">
            <Input />
          </Form.Item>
          <Form.Item name="contract_value" label="Contract Value" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="completion_date" label="Completion Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'SUSPENDED', label: 'Suspended' }]} />
          </Form.Item>
        </Form>
      </Modal>

      {settingsProject && (
        <ProjectSettingsDrawer project={settingsProject} onClose={() => setSettingsProject(null)} />
      )}

      {assignmentsProject && (
        <AssignmentsModal project={assignmentsProject} onClose={() => setAssignmentsProject(null)} />
      )}
    </div>
  );
}
