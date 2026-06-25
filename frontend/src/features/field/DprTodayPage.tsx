import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Popconfirm,
  Select,
  Skeleton,
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
import { RequireAttendance } from '@/components/field/RequireAttendance';
import { useProjectContextStore } from '@/store/project-context-store';
import { useAuthStore } from '@/store/auth-store';
import {
  useBulkUpsertProduction,
  useCreateDprHeader,
  useDeleteDprHeader,
  useDprHeader,
  useDprList,
  useDprMeasurements,
  useDprProduction,
  useAddDprIssue,
  useSubmitDpr,
  useUpdateDprHeader,
  type IssueSeverity,
} from '@/api/hooks/useDpr';
import { useBoqSections, type BoqItemRead, type BoqSectionRead } from '@/api/hooks/useBoq';
import { useProjects } from '@/api/hooks/useProjects';
import { useUploadPhoto } from '@/api/hooks/useUpload';
import { useThemeMode } from '@/theme/theme-context';
import { useDateFormat, useNumberFormat } from '@/utils/format';

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
  const { data: dprMeasurements } = useDprMeasurements(headerId);
  const bulkUpsert = useBulkUpsertProduction();

  // BOQ items that have a submitted (or beyond) measurement are locked in the
  // production tab — the measurement is the single source of truth for that qty.
  const lockedByMeasurement = new Set(
    (dprMeasurements ?? [])
      .filter((m) => m.status !== 'DRAFT' && m.status !== 'REJECTED')
      .map((m) => m.boq_item_id),
  );
  const { resolvedMode } = useThemeMode();
  const { fmtAmt, fmtQty, symbol } = useNumberFormat();

  const HDR_BG = resolvedMode === 'dark' ? 'rgba(22, 119, 255, 0.10)' : '#f0f5ff';

  const [activitySummary, setActivitySummary] = useState('');
  const [production, setProduction] = useState<Record<string, ProductionState>>({});
  // Tracks which rows the user has edited locally since the last save, so an
  // external update (e.g. a Measurement syncing its qty into this same day)
  // can still flow in for untouched rows without clobbering an in-progress edit.
  const touchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!existingEntries) return;
    setProduction((prev) => {
      const next = { ...prev };
      for (const e of existingEntries) {
        if (!touchedRef.current.has(e.boq_item_id)) {
          next[e.boq_item_id] = { qty: e.qty_today, chainage: e.chainage ?? '' };
        }
      }
      return next;
    });
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
      touchedRef.current.clear();
      message.success('Production entries saved');
    } catch {
      message.error('Could not save production entries');
    }
  };

  const setQty = (boqItemId: string, qty: string) => {
    touchedRef.current.add(boqItemId);
    setProduction((prev) => ({ ...prev, [boqItemId]: { ...prev[boqItemId], qty } }));
  };

  const setChainage = (boqItemId: string, chainage: string) => {
    touchedRef.current.add(boqItemId);
    setProduction((prev) => ({ ...prev, [boqItemId]: { ...prev[boqItemId], chainage } }));
  };

  const rows = buildProductionRows(sections ?? []);

  const computeAmount = (item: BoqItemRead, qty: string) => {
    const q = parseFloat(qty || '0');
    const r = parseFloat(item.rate);
    if (isNaN(q) || isNaN(r)) return '—';
    return fmtAmt(q * r);
  };

  const columns: TableColumnsType<ProductionRow> = [
    {
      title: 'Item No',
      key: 'item_no',
      width: 80,
      onCell: (row) =>
        row._type === 'header'
          ? { colSpan: 6, style: { background: HDR_BG, fontWeight: 600, padding: '6px 12px' } }
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
      width: 200,
      ellipsis: true,
      onCell: (row) => (row._type === 'header' ? { colSpan: 0 } : {}),
      render: (_, row) => (row._type === 'item' ? row.item.description : null),
    },
    {
      title: `Rate (${symbol})`,
      key: 'rate',
      width: 90,
      align: 'right' as const,
      onCell: (row) => (row._type === 'header' ? { colSpan: 0 } : {}),
      render: (_, row) => (row._type === 'item' ? fmtQty(row.item.rate, 2) : null),
    },
    {
      title: "Today's Qty",
      key: 'qty_today',
      width: 130,
      onCell: (row) => (row._type === 'header' ? { colSpan: 0 } : {}),
      render: (_, row) => {
        if (row._type !== 'item') return null;
        const val = production[row.item.id]?.qty ?? '';
        const fromMeasurement = lockedByMeasurement.has(row.item.id);
        if (fromMeasurement) {
          return (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontWeight: 500 }}>{val || '0'}</span>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>← MB</Typography.Text>
            </span>
          );
        }
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
      title: 'Amount',
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

  if (sectionsLoading) return <Skeleton active paragraph={{ rows: 4 }} />;

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
        scroll={{ x: 740 }}
        onRow={(row) => ({
          style: { background: row._type === 'header' ? HDR_BG : undefined },
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
  const selectedEntryDate = useProjectContextStore((s) => s.selectedEntryDate);
  const setSelectedEntryDate = useProjectContextStore((s) => s.setSelectedEntryDate);
  const authUser = useAuthStore((s) => s.user);

  const entryDate = dayjs(selectedEntryDate);
  const entryDateStr = selectedEntryDate;
  const isToday = entryDateStr === dayjs().format('YYYY-MM-DD');
  const { fmtDate, dateFormat } = useDateFormat();
  const { data: projects } = useProjects();
  const project = (projects ?? []).find((p) => p.id === selectedProjectId);
  const { data: dprList, isLoading: listLoading } = useDprList(selectedProjectId);
  const { data: header } = useDprHeader(currentDprHeaderId);
  const createHeader = useCreateDprHeader();
  const updateHeader = useUpdateDprHeader();
  const deleteHeader = useDeleteDprHeader();
  const addIssue = useAddDprIssue();
  const submitDpr = useSubmitDpr();
  const uploadPhoto = useUploadPhoto();
  const [issueForm] = Form.useForm<IssueFormValues>();
  const [issuePhoto, setIssuePhoto] = useState<File | null>(null);
  const [supervisorName, setSupervisorName] = useState('');
  const initializedForHeaderId = useRef<string | null>(null);
  const [noWork, setNoWork] = useState(false);
  const [noWorkReasonKind, setNoWorkReasonKind] = useState<string>('Rain');
  const [noWorkReasonCustom, setNoWorkReasonCustom] = useState('');

  const selectedDateHeader = dprList?.find((d) => d.report_date === entryDateStr);

  useEffect(() => {
    if (listLoading) return;
    if (selectedDateHeader) {
      if (selectedDateHeader.id !== currentDprHeaderId) setCurrentDprHeaderId(selectedDateHeader.id);
    } else if (currentDprHeaderId) {
      setCurrentDprHeaderId(null);
    }
  }, [selectedDateHeader, currentDprHeaderId, setCurrentDprHeaderId, listLoading]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentDprHeaderId === null) {
        if (initializedForHeaderId.current !== null) {
          initializedForHeaderId.current = null;
          setSupervisorName(authUser?.fullName ?? '');
          setNoWork(false);
          setNoWorkReasonKind('Rain');
          setNoWorkReasonCustom('');
        }
        return;
      }
      if (!header || header.id !== currentDprHeaderId) return;
      if (initializedForHeaderId.current === currentDprHeaderId) return;
      initializedForHeaderId.current = currentDprHeaderId;
      setSupervisorName(header.supervisor_name ?? authUser?.fullName ?? '');
      setNoWork(header.no_work);
      if (header.no_work_reason) {
        if ((NO_WORK_REASONS as readonly string[]).includes(header.no_work_reason)) {
          setNoWorkReasonKind(header.no_work_reason);
        } else {
          setNoWorkReasonKind('Other');
          setNoWorkReasonCustom(header.no_work_reason);
        }
      } else {
        setNoWorkReasonKind('Rain');
        setNoWorkReasonCustom('');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [currentDprHeaderId, header, authUser]);

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
        report_date: entryDateStr,
        supervisor_name: supervisorName.trim() || undefined,
        no_work: noWork,
        no_work_reason: noWork ? computedNoWorkReason : null,
      });
      setCurrentDprHeaderId(created.id);
    } catch {
      message.error(`Could not start the DPR for ${fmtDate(entryDateStr)}`);
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

  const handleDeleteDpr = async () => {
    if (!currentDprHeaderId || !selectedProjectId) return;
    try {
      await deleteHeader.mutateAsync({ headerId: currentDprHeaderId, projectId: selectedProjectId });
      setCurrentDprHeaderId(null);
      message.success('DPR deleted');
    } catch {
      message.error('Could not delete DPR');
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

  if (listLoading) return <Skeleton active paragraph={{ rows: 4 }} />;

  const minDate = project ? dayjs(project.start_date) : undefined;
  const disabledEntryDate = (d: dayjs.Dayjs) =>
    d.isAfter(dayjs(), 'day') || (minDate ? d.isBefore(minDate, 'day') : false);
  const entryDatePicker = (
    <DatePicker
      value={entryDate}
      onChange={(d) => { if (d) setSelectedEntryDate(d.format('YYYY-MM-DD')); }}
      disabledDate={disabledEntryDate}
      format={dateFormat}
      allowClear={false}
    />
  );

  if (!selectedDateHeader && !header) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>{isToday ? "Today's DPR" : 'DPR Entry'}</Typography.Title>
          {entryDatePicker}
        </div>
        <ProjectSelector style={{ marginBottom: 16, width: '100%' }} />
        <RequireAttendance projectId={selectedProjectId}>
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
          <Empty description={`No DPR started for ${fmtDate(entryDateStr)} yet`}>
            <Button type="primary" size="large" loading={createHeader.isPending} onClick={handleStart}>
              {isToday ? "Start Today's DPR" : `Start DPR for ${fmtDate(entryDateStr)}`}
            </Button>
          </Empty>
        </Card>
        </RequireAttendance>
      </div>
    );
  }

  const isSubmitted = header?.status !== 'DRAFT';

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {isToday ? "Today's DPR" : 'DPR'} — {fmtDate(entryDateStr)}
        </Typography.Title>
        <Space>
          {entryDatePicker}
          <Tag color={header?.status === 'APPROVED' ? 'green' : header?.status === 'SUBMITTED' ? 'blue' : 'default'}>
            {header?.status ?? 'DRAFT'}
          </Tag>
        </Space>
      </div>
      <ProjectSelector style={{ marginBottom: 12, width: '100%' }} />

      <RequireAttendance projectId={selectedProjectId}>
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
        <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
          <Button danger block size="large" loading={submitDpr.isPending} onClick={handleSubmit}>
            Submit Today's DPR
          </Button>
          <Popconfirm
            title="Delete this DPR?"
            description="All production entries, materials, machinery, and issues for this date will be permanently deleted."
            onConfirm={handleDeleteDpr}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button block size="large" loading={deleteHeader.isPending}>
              Delete this DPR
            </Button>
          </Popconfirm>
        </Space>
      )}
      </RequireAttendance>
    </div>
  );
}
