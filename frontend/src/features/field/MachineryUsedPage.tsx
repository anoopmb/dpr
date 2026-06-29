import { useState } from 'react';
import { getApiErrorMessage } from '@/utils/api-error';
import {
  Alert, Button, InputNumber, Popconfirm, Select, Skeleton, Table, Tag,
  Typography, message, theme,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { CheckOutlined, CloseOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import {
  useAddDprMachinery,
  useDeleteDprMachinery,
  useDprHeader,
  useUpdateDprMachinery,
  type DprMachineryRead,
} from '@/api/hooks/useDpr';
import { useMachinery, MACHINERY_HIRE_UNIT_LABELS } from '@/api/hooks/useMasters';
import { useTodayDprHeader } from '@/hooks/useTodayDprHeader';
import { RequireAttendance } from '@/components/field/RequireAttendance';
import { useDateFormat, useNumberFormat } from '@/utils/format';

let _draftSeq = 0;
const nextDraftKey = () => `dmc-${++_draftSeq}`;

interface DraftRow {
  key: string;
  machinery_id: string | null;
  qty: number | null;
  hire_rate: number | null;
  hire_unit: string | null;
}

type Row = { _kind: 'existing'; entry: DprMachineryRead } | { _kind: 'draft'; draft: DraftRow };

export function MachineryUsedPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const selectedEntryDate = useProjectContextStore((s) => s.selectedEntryDate);
  const { fmtDate } = useDateFormat();
  const { fmtAmt, symbol } = useNumberFormat();
  const { token } = theme.useToken();
  const { headerId, isLoading, ensureHeader, creating } = useTodayDprHeader(selectedProjectId);
  const { data: header } = useDprHeader(headerId);
  const { data: machinery } = useMachinery();
  const addMachinery = useAddDprMachinery();
  const updateMachinery = useUpdateDprMachinery();
  const deleteMachinery = useDeleteDprMachinery();
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  const machineryById = new Map((machinery ?? []).map((m) => [m.id, m]));
  const isDraft = header?.status === 'DRAFT';
  const isLocked = !!headerId && !isDraft;
  const entries = header?.machinery_entries ?? [];

  const patchDraft = (key: string, patch: Partial<DraftRow>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const removeDraft = (key: string) =>
    setDrafts((prev) => prev.filter((d) => d.key !== key));

  const saveDraft = async (draft: DraftRow) => {
    if (!draft.machinery_id || draft.qty == null) {
      message.warning('Machine and quantity are required');
      return;
    }
    setSavingKeys((p) => new Set(p).add(draft.key));
    try {
      const id = headerId ?? (await ensureHeader());
      await addMachinery.mutateAsync({
        headerId: id,
        data: {
          machinery_id: draft.machinery_id,
          quantity_used: String(draft.qty),
          hire_rate: draft.hire_unit !== 'OWNED' && draft.hire_rate != null ? String(draft.hire_rate) : undefined,
        },
      });
      removeDraft(draft.key);
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not add entry'));
    } finally {
      setSavingKeys((p) => { const s = new Set(p); s.delete(draft.key); return s; });
    }
  };

  const saveQty = async (entry: DprMachineryRead, raw: string) => {
    const qty = parseFloat(raw);
    if (isNaN(qty) || qty === parseFloat(entry.quantity_used)) return;
    try {
      await updateMachinery.mutateAsync({
        itemId: entry.id,
        data: { quantity_used: String(qty), hire_rate: entry.hire_unit === 'OWNED' ? null : (entry.hire_rate ?? null) },
      });
    } catch (err) { message.error(getApiErrorMessage(err, 'Could not update')); }
  };

  const saveRate = async (entry: DprMachineryRead, raw: string) => {
    if (entry.hire_unit === 'OWNED') return;
    const rate = raw ? parseFloat(raw) : null;
    const cur = entry.hire_rate != null ? parseFloat(entry.hire_rate) : null;
    if (rate === cur) return;
    try {
      await updateMachinery.mutateAsync({
        itemId: entry.id,
        data: { quantity_used: entry.quantity_used, hire_rate: rate != null ? String(rate) : null },
      });
    } catch (err) { message.error(getApiErrorMessage(err, 'Could not update')); }
  };

  const handleDelete = async (entry: DprMachineryRead) => {
    if (!headerId) return;
    try { await deleteMachinery.mutateAsync({ itemId: entry.id, headerId }); }
    catch (err) { message.error(getApiErrorMessage(err, 'Could not delete')); }
  };

  const rows: Row[] = [
    ...entries.map((entry): Row => ({ _kind: 'existing', entry })),
    ...drafts.map((draft): Row => ({ _kind: 'draft', draft })),
  ];

  const totalCost = entries.reduce((s, e) => s + (e.hire_rate ? parseFloat(e.hire_rate) * parseFloat(e.quantity_used) : 0), 0);

  const inp = { width: '100%' };

  const unitLabel = (hire_unit: string) =>
    MACHINERY_HIRE_UNIT_LABELS[hire_unit as keyof typeof MACHINERY_HIRE_UNIT_LABELS] ?? hire_unit;

  const columns: TableColumnsType<Row> = [
    {
      title: '#',
      key: 'idx',
      width: 40,
      render: (_: unknown, _row: Row, i: number) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{i + 1}</Typography.Text>
      ),
    },
    {
      title: 'Machine',
      key: 'machine',
      render: (_: unknown, row: Row) =>
        row._kind === 'existing' ? (
          <Typography.Text>{machineryById.get(row.entry.machinery_id)?.name ?? row.entry.machinery_id}</Typography.Text>
        ) : (
          <Select
            size="small"
            showSearch
            optionFilterProp="label"
            style={inp}
            placeholder="Select machine…"
            value={row.draft.machinery_id}
            onChange={(v) => {
              const master = machineryById.get(v);
              patchDraft(row.draft.key, {
                machinery_id: v,
                hire_unit: master?.hire_unit ?? null,
                qty: master?.hire_unit === 'OWNED' ? 1 : null,
                hire_rate: master?.hire_unit === 'OWNED' ? null : (master?.hire_rate ? parseFloat(master.hire_rate) : null),
              });
            }}
            options={(machinery ?? []).map((m) => ({ value: m.id, label: m.name }))}
          />
        ),
    },
    {
      title: 'Billing Unit',
      key: 'hire_unit',
      width: 110,
      render: (_: unknown, row: Row) => {
        const unit = row._kind === 'existing' ? row.entry.hire_unit : row.draft.hire_unit;
        if (!unit) return null;
        return (
          <Tag color={unit === 'OWNED' ? 'purple' : 'blue'} style={{ margin: 0, fontSize: 11 }}>
            {unitLabel(unit)}
          </Tag>
        );
      },
    },
    {
      title: 'Qty',
      key: 'qty',
      width: 90,
      render: (_: unknown, row: Row) => {
        if (row._kind === 'existing') {
          return (
            <InputNumber
              key={`${row.entry.id}-qty-${row.entry.quantity_used}`}
              size="small"
              min={0}
              style={inp}
              defaultValue={parseFloat(row.entry.quantity_used)}
              onBlur={(e) => saveQty(row.entry, e.target.value)}
              disabled={!isDraft || row.entry.hire_unit === 'OWNED'}
            />
          );
        }
        return (
          <InputNumber
            size="small"
            min={0}
            style={inp}
            placeholder="0"
            value={row.draft.qty}
            disabled={row.draft.hire_unit === 'OWNED'}
            onChange={(v) => patchDraft(row.draft.key, { qty: v })}
          />
        );
      },
    },
    {
      title: `Hire Rate (${symbol})`,
      key: 'rate',
      width: 130,
      render: (_: unknown, row: Row) => {
        if (row._kind === 'existing') {
          if (row.entry.hire_unit === 'OWNED') {
            return <Typography.Text type="secondary" style={{ fontSize: 12 }}>Owned — no cost</Typography.Text>;
          }
          return (
            <InputNumber
              key={`${row.entry.id}-rate-${row.entry.hire_rate}`}
              size="small"
              min={0}
              precision={2}
              style={inp}
              defaultValue={row.entry.hire_rate != null ? parseFloat(row.entry.hire_rate) : undefined}
              placeholder="—"
              onBlur={(e) => saveRate(row.entry, e.target.value)}
              disabled={!isDraft}
            />
          );
        }
        if (row.draft.hire_unit === 'OWNED') {
          return <Typography.Text type="secondary" style={{ fontSize: 12 }}>Owned — no cost</Typography.Text>;
        }
        return (
          <InputNumber
            size="small"
            min={0}
            precision={2}
            style={inp}
            placeholder="Rate (auto)"
            value={row.draft.hire_rate}
            onChange={(v) => patchDraft(row.draft.key, { hire_rate: v })}
          />
        );
      },
    },
    {
      title: `Cost (${symbol})`,
      key: 'cost',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, row: Row) => {
        if (row._kind === 'existing') {
          const cost = row.entry.hire_rate ? parseFloat(row.entry.hire_rate) * parseFloat(row.entry.quantity_used) : null;
          return <Typography.Text strong>{cost != null ? fmtAmt(cost) : '—'}</Typography.Text>;
        }
        const cost = row.draft.hire_rate != null && row.draft.qty != null ? row.draft.hire_rate * row.draft.qty : null;
        return <Typography.Text type="secondary">{cost != null ? fmtAmt(cost) : '—'}</Typography.Text>;
      },
    },
    {
      title: '',
      key: 'actions',
      width: 68,
      render: (_: unknown, row: Row) => {
        if (row._kind === 'existing') {
          if (!isDraft) return null;
          return (
            <Popconfirm
              title="Delete this entry?"
              onConfirm={() => handleDelete(row.entry)}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                loading={deleteMachinery.isPending}
              />
            </Popconfirm>
          );
        }
        return (
          <span style={{ display: 'flex', gap: 2 }}>
            <Button
              size="small"
              type="text"
              icon={<CheckOutlined />}
              style={{ color: token.colorSuccess }}
              loading={savingKeys.has(row.draft.key) || creating}
              onClick={() => saveDraft(row.draft)}
            />
            <Button
              size="small"
              type="text"
              danger
              icon={<CloseOutlined />}
              onClick={() => removeDraft(row.draft.key)}
            />
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 4 }}>Machinery Used</Typography.Title>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Entry date: {fmtDate(selectedEntryDate)}
      </Typography.Text>
      <ProjectSelector style={{ marginBottom: 16, width: '100%' }} />

      {!selectedProjectId && <Alert type="warning" showIcon message="Select a project to continue" />}

      {isLocked && (
        <Alert
          type="info"
          showIcon
          message={`The DPR for ${fmtDate(selectedEntryDate)} has been ${header?.status?.toLowerCase()} and is locked.`}
          style={{ marginBottom: 16 }}
        />
      )}

      {selectedProjectId && isLoading && <Skeleton active />}

      {selectedProjectId && !isLoading && (
        <RequireAttendance projectId={selectedProjectId}>
          <div style={{
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadiusLG,
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              background: token.colorFillAlter,
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Typography.Text strong style={{ fontSize: 14 }}>Line Items</Typography.Text>
                <Tag style={{ margin: 0, fontSize: 11 }}>
                  {entries.length} item{entries.length !== 1 ? 's' : ''}
                </Tag>
              </span>
              {isDraft && (
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() =>
                    setDrafts((p) => [
                      ...p,
                      { key: nextDraftKey(), machinery_id: null, qty: null, hire_rate: null, hire_unit: null },
                    ])
                  }
                >
                  Add Machine
                </Button>
              )}
            </div>

            <Table<Row>
              rowKey={(row) => row._kind === 'existing' ? row.entry.id : row.draft.key}
              size="small"
              dataSource={rows}
              columns={columns}
              pagination={false}
              scroll={{ x: 680 }}
              locale={{ emptyText: isDraft ? 'No entries yet — click "Add Machine" above' : 'No machinery entries' }}
              summary={totalCost > 0 ? () => (
                <Table.Summary>
                  <Table.Summary.Row style={{ fontWeight: 700 }}>
                    <Table.Summary.Cell index={0} colSpan={5}>Total Machinery Cost</Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">{fmtAmt(totalCost)}</Table.Summary.Cell>
                    {isDraft && <Table.Summary.Cell index={6} />}
                  </Table.Summary.Row>
                </Table.Summary>
              ) : undefined}
            />
          </div>
        </RequireAttendance>
      )}
    </div>
  );
}
