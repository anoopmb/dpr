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
  useAddDprMaterial,
  useDeleteDprMaterial,
  useDprHeader,
  useUpdateDprMaterial,
  type DprMaterialRead,
} from '@/api/hooks/useDpr';
import { useMaterials, useUoms } from '@/api/hooks/useMasters';
import { useTodayDprHeader } from '@/hooks/useTodayDprHeader';
import { RequireAttendance } from '@/components/field/RequireAttendance';
import { useDateFormat, useNumberFormat } from '@/utils/format';

let _draftSeq = 0;
const nextDraftKey = () => `dm-${++_draftSeq}`;

interface DraftRow {
  key: string;
  material_id: string | null;
  qty: number | null;
  uom_id: string | null;
  rate: number | null;
}

type Row = { _kind: 'existing'; entry: DprMaterialRead } | { _kind: 'draft'; draft: DraftRow };

export function MaterialsUsedPage() {
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const selectedEntryDate = useProjectContextStore((s) => s.selectedEntryDate);
  const { fmtDate } = useDateFormat();
  const { fmtAmt, symbol } = useNumberFormat();
  const { token } = theme.useToken();
  const { headerId, isLoading, ensureHeader, creating } = useTodayDprHeader(selectedProjectId);
  const { data: header } = useDprHeader(headerId);
  const { data: materials } = useMaterials();
  const { data: uoms } = useUoms();
  const addMaterial = useAddDprMaterial();
  const updateMaterial = useUpdateDprMaterial();
  const deleteMaterial = useDeleteDprMaterial();
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  const materialById = new Map((materials ?? []).map((m) => [m.id, m]));
  const isDraft = header?.status === 'DRAFT';
  const isLocked = !!headerId && !isDraft;
  const entries = header?.materials ?? [];

  const patchDraft = (key: string, patch: Partial<DraftRow>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const removeDraft = (key: string) =>
    setDrafts((prev) => prev.filter((d) => d.key !== key));

  const saveDraft = async (draft: DraftRow) => {
    if (!draft.material_id || draft.qty == null || !draft.uom_id) {
      message.warning('Material, quantity and unit are required');
      return;
    }
    setSavingKeys((p) => new Set(p).add(draft.key));
    try {
      const id = headerId ?? (await ensureHeader());
      await addMaterial.mutateAsync({
        headerId: id,
        data: {
          material_id: draft.material_id,
          qty_consumed: String(draft.qty),
          uom_id: draft.uom_id,
          rate: draft.rate != null ? String(draft.rate) : undefined,
        },
      });
      removeDraft(draft.key);
    } catch (err) {
      message.error(getApiErrorMessage(err, 'Could not add entry'));
    } finally {
      setSavingKeys((p) => { const s = new Set(p); s.delete(draft.key); return s; });
    }
  };

  const saveQty = async (entry: DprMaterialRead, raw: string) => {
    const qty = parseFloat(raw);
    if (isNaN(qty) || qty === parseFloat(entry.qty_consumed)) return;
    try {
      await updateMaterial.mutateAsync({ itemId: entry.id, data: { qty_consumed: String(qty), uom_id: entry.uom_id, rate: entry.rate ?? undefined } });
    } catch (err) { message.error(getApiErrorMessage(err, 'Could not update')); }
  };

  const saveRate = async (entry: DprMaterialRead, raw: string) => {
    const rate = raw ? parseFloat(raw) : null;
    const cur = entry.rate != null ? parseFloat(entry.rate) : null;
    if (rate === cur) return;
    try {
      await updateMaterial.mutateAsync({ itemId: entry.id, data: { qty_consumed: entry.qty_consumed, uom_id: entry.uom_id, rate: rate != null ? String(rate) : undefined } });
    } catch (err) { message.error(getApiErrorMessage(err, 'Could not update')); }
  };

  const saveUom = async (entry: DprMaterialRead, uomId: string) => {
    if (uomId === entry.uom_id) return;
    try {
      await updateMaterial.mutateAsync({ itemId: entry.id, data: { qty_consumed: entry.qty_consumed, uom_id: uomId, rate: entry.rate ?? undefined } });
    } catch (err) { message.error(getApiErrorMessage(err, 'Could not update')); }
  };

  const handleDelete = async (entry: DprMaterialRead) => {
    if (!headerId) return;
    try { await deleteMaterial.mutateAsync({ itemId: entry.id, headerId }); }
    catch (err) { message.error(getApiErrorMessage(err, 'Could not delete')); }
  };

  const rows: Row[] = [
    ...entries.map((entry): Row => ({ _kind: 'existing', entry })),
    ...drafts.map((draft): Row => ({ _kind: 'draft', draft })),
  ];

  const totalCost = entries.reduce((s, e) => s + (e.rate ? parseFloat(e.rate) * parseFloat(e.qty_consumed) : 0), 0);

  const inp = { width: '100%' };

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
      title: 'Material',
      key: 'material',
      render: (_: unknown, row: Row) =>
        row._kind === 'existing' ? (
          <Typography.Text>{materialById.get(row.entry.material_id)?.name ?? row.entry.material_id}</Typography.Text>
        ) : (
          <Select
            size="small"
            showSearch
            optionFilterProp="label"
            style={inp}
            placeholder="Select material…"
            value={row.draft.material_id}
            onChange={(v) => {
              const mat = materialById.get(v);
              patchDraft(row.draft.key, {
                material_id: v,
                uom_id: mat?.default_uom_id ?? null,
                rate: mat?.cost_rate != null ? parseFloat(mat.cost_rate) : null,
              });
            }}
            options={(materials ?? []).map((m) => ({ value: m.id, label: m.name }))}
          />
        ),
    },
    {
      title: 'Qty',
      key: 'qty',
      width: 100,
      render: (_: unknown, row: Row) =>
        row._kind === 'existing' ? (
          <InputNumber
            key={`${row.entry.id}-qty-${row.entry.qty_consumed}`}
            size="small"
            min={0}
            style={inp}
            defaultValue={parseFloat(row.entry.qty_consumed)}
            onBlur={(e) => saveQty(row.entry, e.target.value)}
            disabled={!isDraft}
          />
        ) : (
          <InputNumber
            size="small"
            min={0}
            style={inp}
            placeholder="0"
            value={row.draft.qty}
            onChange={(v) => patchDraft(row.draft.key, { qty: v })}
          />
        ),
    },
    {
      title: 'Unit',
      key: 'uom',
      width: 90,
      render: (_: unknown, row: Row) =>
        row._kind === 'existing' ? (
          <Select
            key={`${row.entry.id}-uom-${row.entry.uom_id}`}
            size="small"
            showSearch
            optionFilterProp="label"
            style={inp}
            defaultValue={row.entry.uom_id}
            onChange={(v) => saveUom(row.entry, v)}
            options={(uoms ?? []).map((u) => ({ value: u.id, label: u.code }))}
            disabled={!isDraft}
          />
        ) : (
          <Select
            size="small"
            showSearch
            optionFilterProp="label"
            style={inp}
            placeholder="Unit"
            value={row.draft.uom_id}
            onChange={(v) => patchDraft(row.draft.key, { uom_id: v })}
            options={(uoms ?? []).map((u) => ({ value: u.id, label: u.code }))}
          />
        ),
    },
    {
      title: `Rate (${symbol})`,
      key: 'rate',
      width: 120,
      render: (_: unknown, row: Row) =>
        row._kind === 'existing' ? (
          <InputNumber
            key={`${row.entry.id}-rate-${row.entry.rate}`}
            size="small"
            min={0}
            precision={2}
            style={inp}
            defaultValue={row.entry.rate != null ? parseFloat(row.entry.rate) : undefined}
            placeholder="—"
            onBlur={(e) => saveRate(row.entry, e.target.value)}
            disabled={!isDraft}
          />
        ) : (
          <InputNumber
            size="small"
            min={0}
            precision={2}
            style={inp}
            placeholder="Rate (auto)"
            value={row.draft.rate}
            onChange={(v) => patchDraft(row.draft.key, { rate: v })}
          />
        ),
    },
    {
      title: `Amount (${symbol})`,
      key: 'amount',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, row: Row) => {
        if (row._kind === 'existing') {
          const amt = row.entry.rate != null ? parseFloat(row.entry.rate) * parseFloat(row.entry.qty_consumed) : null;
          return <Typography.Text strong>{amt != null ? fmtAmt(amt) : '—'}</Typography.Text>;
        }
        const amt = row.draft.rate != null && row.draft.qty != null ? row.draft.rate * row.draft.qty : null;
        return <Typography.Text type="secondary">{amt != null ? fmtAmt(amt) : '—'}</Typography.Text>;
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
                loading={deleteMaterial.isPending}
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
      <Typography.Title level={4} style={{ marginBottom: 4 }}>Materials Used</Typography.Title>
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
                  onClick={() => setDrafts((p) => [...p, { key: nextDraftKey(), material_id: null, qty: null, uom_id: null, rate: null }])}
                >
                  Add Material
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
              locale={{ emptyText: isDraft ? 'No entries yet — click "Add Material" above' : 'No material entries' }}
              summary={totalCost > 0 ? () => (
                <Table.Summary>
                  <Table.Summary.Row style={{ fontWeight: 700 }}>
                    <Table.Summary.Cell index={0} colSpan={5}>Total Material Cost</Table.Summary.Cell>
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
