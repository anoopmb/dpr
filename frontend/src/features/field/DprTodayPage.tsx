import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { PhotoCapture } from '@/components/common/PhotoCapture';
import { useProjectContextStore } from '@/store/project-context-store';
import { useAuthStore } from '@/store/auth-store';
import {
  useBulkUpsertProduction,
  useCreateDprHeader,
  useDprHeader,
  useDprList,
  useDprProduction,
  useAddDprIssue,
  useSubmitDpr,
  useUpdateDprHeader,
  type IssueSeverity,
} from '@/api/hooks/useDpr';
import { useBoqSections, type BoqItemRead, type BoqSectionRead } from '@/api/hooks/useBoq';
import { useUploadPhoto } from '@/api/hooks/useUpload';

const TASKS = [
  { key: '/field/materials', label: 'Materials Used' },
  { key: '/field/machinery', label: 'Machinery Used' },
  { key: '/field/workers', label: 'Attendance' },
  { key: '/field/measurements', label: 'Measurements' },
];

interface IssueFormValues {
  description: string;
  severity: IssueSeverity;
}

const NO_WORK_REASONS = ['Rain', 'Holiday', 'Sunday', 'Other'] as const;

type ProductionRow =
  | { _type: 'header'; section: BoqSectionRead; key: string }
  | { _type: 'item'; item: BoqItemRead; key: string };

function buildProductionRows(sections: BoqSectionRead[]): ProductionRow[] {
  const rows: ProductionRow[] = [];
  for (const section of sections) {
    if (section.items.length === 0) continue;
    rows.push({ _type: 'header', section, key: `hdr-${section.id}` });
    for (const item of section.items) {
      rows.push({ _type: 'item', item, key: item.id });
    }
  }
  return rows;
}

interface ProductionState {
  qty: string;
  chainage: string;
}

function ProductionTab({
  headerId,
  isSubmitted,
}: {
  headerId: string;
  isSubmitted: boolean;
}) {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const { data: sections, isLoading: sectionsLoading } = useBoqSections(selectedProjectId);
  const { data: existingEntries } = useDprProduction(headerId);
  const bulkUpsert = useBulkUpsertProduction();

  const [activitySummary, setActivitySummary] = useState('');
  const [production, setProduction] = useState<Record<string, ProductionState>>({});
  const initialized = useRef(false);

  useEffect(() => {
    if (existingEntries && !initialized.current) {
      initialized.current = true;
      const init: Record<string, ProductionState> = {};
      for (const e of existingEntries) {
        init[e.boq_item_id] = { qty: e.qty_today, chainage: e.chainage ?? '' };
      }
      setProduction(init);
    }
  }, [existingEntries]);

  const handleSave = async () => {
    const entries = Object.entries(production)
      .filter(([, v]) => v.qty !== '' && v.qty !== '0')
      .map(([boq_item_id, v]) => ({
        boq_item_id,
        qty_today: v.qty,
        chainage: v.chainage.trim() || null,
      }));

    try {
      await bulkUpsert.mutateAsync({
        headerId,
        data: { daily_work_summary: activitySummary.trim() || null, entries },
      });
      message.success('Production entries saved');
    } catch {
      message.error('Could not save production entries');
    }
  };

  const setQty = (boqItemId: string, qty: string) =>
    setProduction((prev) => ({ ...prev, [boqItemId]: { ...prev[boqItemId], qty } }));

  const setChainage = (boqItemId: string, chainage: string) =>
    setProduction((prev) => ({ ...prev, [boqItemId]: { ...prev[boqItemId], chainage } }));

  const rows = buildProductionRows(sections ?? []);

  const computeAmount = (item: BoqItemRead, qty: string) => {
    const q = parseFloat(qty || '0');
    const r = parseFloat(item.rate);
    if (isNaN(q) || isNaN(r)) return '—';
    return (q * r).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  };

  const columns: TableColumnsType<ProductionRow> = [
    {
      title: 'Item No',
      key: 'item_no',
      width: 80,
      onCell: (row) =>
        row._type === 'header'
          ? { colSpan: 5, style: { background: '#f0f5ff', fontWeight: 600, padding: '6px 12px' } }
          : {},
      render: (_, row) => {
        if (row._type === 'header')
          return `${row.section.section_no}. ${row.section.section_name.toUpperCase()}`;
        return row.item.item_no;
      },
    },
    {
      title: 'Description',
      key: 'description',
      ellipsis: true,
      onCell: (row) => (row._type === 'header' ? { colSpan: 0 } : {}),
      render: (_, row) => (row._type === 'item' ? row.item.description : null),
    },
    {
      title: "Today's Qty",
      key: 'qty_today',
      width: 130,
      onCell: (row) => (row._type === 'header' ? { colSpan: 0 } : {}),
      render: (_, row) => {
        if (row._type !== 'item') return null;
        const val = production[row.item.id]?.qty ?? '';
        return (
          <InputNumber
            size="small"
            value={val === '' ? undefined : parseFloat(val)}
            onChange={(v) => setQty(row.item.id, v === null || v === undefined ? '' : String(v))}
            disabled={isSubmitted}
            style={{ width: '100%' }}
            placeholder="0"
          />
        );
      },
    },
    {
      title: 'Amount (₹)',
      key: 'amount',
      width: 110,
      align: 'right' as const,
      onCell: (row) => (row._type === 'header' ? { colSpan: 0 } : {}),
      render: (_, row) => {
        if (row._type !== 'item') return null;
        return computeAmount(row.item, production[row.item.id]?.qty ?? '');
      },
    },
    {
      title: 'Chainage',
      key: 'chainage',
      width: 130,
      onCell: (row) => (row._type === 'header' ? { colSpan: 0 } : {}),
      render: (_, row) => {
        if (row._type !== 'item') return null;
        return (
          <Input
            size="small"
            value={production[row.item.id]?.chainage ?? ''}
            onChange={(e) => setChainage(row.item.id, e.target.value)}
            disabled={isSubmitted}
            placeholder="e.g. 2/130–2/390"
          />
        );
      },
    },
  ];

  if (sectionsLoading) return <Typography.Text>Loading BOQ...</Typography.Text>;

  if ((sections ?? []).length === 0) {
    return (
      <Empty description="No BOQ sections set up yet. Add sections and items in the BOQ page first." />
    );
  }

  return (
    <div>
      <Form.Item label="Today's Activity (optional)" style={{ marginBottom: 12 }}>
        <Input
          placeholder="e.g. Earthwork and Clearing grass"
          value={activitySummary}
          onChange={(e) => setActivitySummary(e.target.value)}
          disabled={isSubmitted}
          maxLength={500}
        />
      </Form.Item>

      <Table
        rowKey="key"
        dataSource={rows}
        columns={columns}
        pagination={false}
        size="small"
        bordered
        onRow={(row) => ({
          style: { background: row._type === 'header' ? '#f0f5ff' : undefined },
        })}
      />

      {!isSubmitted && (
        <Button
          type="primary"
          block
          style={{ marginTop: 12 }}
          loading={bulkUpsert.isPending}
          onClick={handleSave}
        >
          Save Production Entries
        </Button>
      )}
      {isSubmitted && (
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, textAlign: 'center' }}>
          DPR submitted — production entries are locked.
        </Typography.Text>
      )}
    </div>
  );
}

export function DprTodayPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const currentDprHeaderId = useProjectContextStore((s) => s.currentDprHeaderId);
  const setCurrentDprHeaderId = useProjectContextStore((s) => s.setCurrentDprHeaderId);
  const authUser = useAuthStore((s) => s.user);

  const today = dayjs().format('YYYY-MM-DD');
  const { data: dprList, isLoading: listLoading } = useDprList(selectedProjectId);
  const { data: header } = useDprHeader(currentDprHeaderId);
  const createHeader = useCreateDprHeader();
  const updateHeader = useUpdateDprHeader();
  const addIssue = useAddDprIssue();
  const submitDpr = useSubmitDpr();
  const uploadPhoto = useUploadPhoto();
  const [issueForm] = Form.useForm<IssueFormValues>();
  const [issuePhoto, setIssuePhoto] = useState<File | null>(null);
  const [supervisorName, setSupervisorName] = useState('');
  const supervisorInitialized = useRef(false);
  const [noWork, setNoWork] = useState(false);
  const [noWorkReasonKind, setNoWorkReasonKind] = useState<string>('Rain');
  const [noWorkReasonCustom, setNoWorkReasonCustom] = useState('');

  const todayHeader = dprList?.find((d) => d.report_date === today);

  useEffect(() => {
    if (todayHeader && todayHeader.id !== currentDprHeaderId) {
      setCurrentDprHeaderId(todayHeader.id);
    }
  }, [todayHeader, currentDprHeaderId, setCurrentDprHeaderId]);

  useEffect(() => {
    if (!supervisorInitialized.current) {
      if (header) {
        supervisorInitialized.current = true;
        setSupervisorName(header.supervisor_name ?? authUser?.fullName ?? '');
        setNoWork(header.no_work);
        if (header.no_work_reason) {
          if ((NO_WORK_REASONS as readonly string[]).includes(header.no_work_reason)) {
            setNoWorkReasonKind(header.no_work_reason);
          } else {
            setNoWorkReasonKind('Other');
            setNoWorkReasonCustom(header.no_work_reason);
          }
        }
      } else if (!currentDprHeaderId && authUser?.fullName) {
        setSupervisorName(authUser.fullName);
      }
    }
  }, [header, currentDprHeaderId, authUser]);

  const computedNoWorkReason = noWorkReasonKind === 'Other' ? noWorkReasonCustom.trim() : noWorkReasonKind;

  const handleStart = async () => {
    if (!selectedProjectId) return;
    if (noWork && !computedNoWorkReason) {
      message.error('Please provide a reason for the no-work day');
      return;
    }
    try {
      const created = await createHeader.mutateAsync({
        project_id: selectedProjectId,
        report_date: today,
        supervisor_name: supervisorName.trim() || undefined,
        no_work: noWork,
        no_work_reason: noWork ? computedNoWorkReason : null,
      });
      setCurrentDprHeaderId(created.id);
    } catch {
      message.error("Could not start today's DPR");
    }
  };

  const handleMarkNoWork = async (checked: boolean) => {
    if (!currentDprHeaderId) return;
    if (checked && !computedNoWorkReason) {
      message.error('Please select a reason for the no-work day');
      return;
    }
    try {
      await updateHeader.mutateAsync({
        headerId: currentDprHeaderId,
        data: { no_work: checked, no_work_reason: checked ? computedNoWorkReason : null },
      });
    } catch {
      message.error(
        checked
          ? 'Cannot mark as a no-work day: this DPR already has production, material, or machinery entries.'
          : 'Could not update no-work status',
      );
    }
  };

  const handleSupervisorBlur = async () => {
    if (!currentDprHeaderId || !header || header.status !== 'DRAFT') return;
    const trimmed = supervisorName.trim() || null;
    if (trimmed === header.supervisor_name) return;
    try {
      await updateHeader.mutateAsync({ headerId: currentDprHeaderId, data: { supervisor_name: trimmed } });
    } catch {
      message.error('Could not update supervisor name');
    }
  };

  const handleAddIssue = async (values: IssueFormValues) => {
    if (!currentDprHeaderId) return;
    try {
      let photo_url: string | undefined;
      if (issuePhoto) {
        photo_url = await uploadPhoto.mutateAsync({ prefix: 'dpr-issues', file: issuePhoto });
      }
      await addIssue.mutateAsync({ headerId: currentDprHeaderId, data: { ...values, photo_url } });
      message.success('Issue logged');
      issueForm.resetFields();
      setIssuePhoto(null);
    } catch {
      message.error('Could not log issue');
    }
  };

  const handleSubmit = async () => {
    if (!currentDprHeaderId) return;
    try {
      await submitDpr.mutateAsync(currentDprHeaderId);
      message.success("Today's DPR submitted");
    } catch {
      message.error('Could not submit DPR');
    }
  };

  if (!selectedProjectId) {
    return (
      <div>
        <Typography.Title level={4}>Today's DPR</Typography.Title>
        <Empty description="Select a project to begin">
          <ProjectSelector />
        </Empty>
      </div>
    );
  }

  if (listLoading) return <Typography.Text>Loading...</Typography.Text>;

  if (!todayHeader && !header) {
    return (
      <div>
        <Typography.Title level={4}>Today's DPR</Typography.Title>
        <ProjectSelector style={{ marginBottom: 16, width: '100%' }} />
        <Card>
          <Form.Item label="Supervisor Name" style={{ marginBottom: 16 }}>
            <Input
              size="large"
              value={supervisorName}
              onChange={(e) => setSupervisorName(e.target.value)}
              placeholder="Name of supervisor"
            />
          </Form.Item>
          <Form.Item label="No work today (rain / holiday / shutdown)" style={{ marginBottom: 16 }}>
            <Switch checked={noWork} onChange={setNoWork} />
          </Form.Item>
          {noWork && (
            <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
              <Select
                style={{ width: '100%' }}
                value={noWorkReasonKind}
                onChange={setNoWorkReasonKind}
                options={NO_WORK_REASONS.map((r) => ({ value: r, label: r }))}
              />
              {noWorkReasonKind === 'Other' && (
                <Input
                  placeholder="Reason for no work"
                  value={noWorkReasonCustom}
                  onChange={(e) => setNoWorkReasonCustom(e.target.value)}
                />
              )}
            </Space>
          )}
          <Empty description={`No DPR started for ${today} yet`}>
            <Button type="primary" size="large" loading={createHeader.isPending} onClick={handleStart}>
              Start Today's DPR
            </Button>
          </Empty>
        </Card>
      </div>
    );
  }

  const isSubmitted = header?.status === 'SUBMITTED';

  const tabItems = [
    {
      key: 'production',
      label: 'Production',
      children: currentDprHeaderId ? (
        <ProductionTab headerId={currentDprHeaderId} isSubmitted={isSubmitted} />
      ) : null,
    },
    {
      key: 'other',
      label: 'Other Tasks',
      children: (
        <Card>
          <List
            dataSource={TASKS}
            renderItem={(item) => (
              <List.Item>
                <Link to={item.key} style={{ fontSize: 16 }}>
                  {item.label}
                </Link>
              </List.Item>
            )}
          />
        </Card>
      ),
    },
    {
      key: 'issues',
      label: 'Issues',
      children: (
        <Card title="Log an Issue / Blocker">
          <Form form={issueForm} layout="vertical" onFinish={handleAddIssue}>
            <Form.Item name="description" label="Description" rules={[{ required: true }]}>
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="severity" label="Severity" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'LOW', label: 'Low' },
                  { value: 'MEDIUM', label: 'Medium' },
                  { value: 'HIGH', label: 'High' },
                  { value: 'CRITICAL', label: 'Critical' },
                ]}
              />
            </Form.Item>
            <PhotoCapture label="Attach Photo (optional)" onCapture={setIssuePhoto} />
            <Button
              type="primary"
              htmlType="submit"
              block
              style={{ marginTop: 12 }}
              loading={addIssue.isPending || uploadPhoto.isPending}
            >
              Log Issue
            </Button>
          </Form>
          {(header?.issues ?? []).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Typography.Text strong>Logged Issues</Typography.Text>
              <List
                size="small"
                dataSource={header?.issues ?? []}
                renderItem={(issue) => (
                  <List.Item>
                    <Space>
                      <Tag color={issue.severity === 'CRITICAL' ? 'red' : issue.severity === 'HIGH' ? 'orange' : 'default'}>
                        {issue.severity}
                      </Tag>
                      <span>{issue.description}</span>
                    </Space>
                  </List.Item>
                )}
              />
            </div>
          )}
        </Card>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Today's DPR — {today}
        </Typography.Title>
        <Tag color={isSubmitted ? 'green' : 'blue'}>{isSubmitted ? 'SUBMITTED' : 'DRAFT'}</Tag>
      </div>
      <ProjectSelector style={{ marginBottom: 12, width: '100%' }} />

      <Form.Item label="Supervisor Name" style={{ marginBottom: 12 }}>
        <Input
          value={supervisorName}
          onChange={(e) => setSupervisorName(e.target.value)}
          onBlur={handleSupervisorBlur}
          disabled={isSubmitted}
          placeholder="Name of supervisor"
        />
      </Form.Item>

      <Form.Item label="No work today (rain / holiday / shutdown)" style={{ marginBottom: 12 }}>
        <Switch checked={noWork} onChange={handleMarkNoWork} disabled={isSubmitted || updateHeader.isPending} />
      </Form.Item>

      {noWork && (
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          <Select
            style={{ width: '100%' }}
            value={noWorkReasonKind}
            onChange={(v) => {
              setNoWorkReasonKind(v);
              if (currentDprHeaderId && !isSubmitted) {
                updateHeader.mutate({
                  headerId: currentDprHeaderId,
                  data: { no_work: true, no_work_reason: v === 'Other' ? noWorkReasonCustom.trim() || v : v },
                });
              }
            }}
            options={NO_WORK_REASONS.map((r) => ({ value: r, label: r }))}
            disabled={isSubmitted}
          />
          {noWorkReasonKind === 'Other' && (
            <Input
              placeholder="Reason for no work"
              value={noWorkReasonCustom}
              onChange={(e) => setNoWorkReasonCustom(e.target.value)}
              onBlur={() => {
                if (currentDprHeaderId && !isSubmitted) {
                  updateHeader.mutate({
                    headerId: currentDprHeaderId,
                    data: { no_work: true, no_work_reason: noWorkReasonCustom.trim() || 'Other' },
                  });
                }
              }}
              disabled={isSubmitted}
            />
          )}
        </Space>
      )}

      {noWork ? (
        <Card>
          <Typography.Text>
            No work was carried out on this date. Reason: <strong>{header?.no_work_reason ?? computedNoWorkReason}</strong>
          </Typography.Text>
        </Card>
      ) : (
        <Tabs defaultActiveKey="production" items={tabItems} />
      )}

      {!isSubmitted && (
        <Button danger block size="large" style={{ marginTop: 16 }} loading={submitDpr.isPending} onClick={handleSubmit}>
          Submit Today's DPR
        </Button>
      )}
    </div>
  );
}
