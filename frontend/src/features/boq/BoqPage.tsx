import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Badge,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
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
  Timeline,
  Typography,
  message,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ExportOutlined,
  ImportOutlined,
  PlusOutlined,
  SaveOutlined,
  AppstoreAddOutlined,
  HistoryOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import { ProjectSelector } from '@/components/common/ProjectSelector';
import { useProjectContextStore } from '@/store/project-context-store';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  useBoqSections,
  useBoqRevisions,
  useCreateBoqItem,
  useCreateBoqRevision,
  useCreateBoqSection,
  useDeleteBoqItem,
  useDeleteBoqSection,
  useApproveBoqRevision,
  useRejectBoqRevision,
  usePendingBoqRevisions,
  useUpdateBoqItem,
  useUpdateBoqSection,
  CONSTRUCTION_TYPE_COLORS,
  CONSTRUCTION_TYPE_LABELS,
  type BoqConstructionType,
  type BoqItemRead,
  type BoqRevisionCreateInput,
  type BoqRevisionRead,
  type BoqRevisionType,
  type BoqSectionRead,
} from '@/api/hooks/useBoq';
import { useUoms, useWorkTypes } from '@/api/hooks/useMasters';
import { useThemeMode } from '@/theme/theme-context';
import { useDateFormat, useNumberFormat } from '@/utils/format';
import { useAuthStore } from '@/store/auth-store';
import {
  useApplyBoqTemplate,
  useBoqImport,
  useBoqTemplateList,
  useDeleteBoqTemplate,
  useSaveBoqTemplateFromProject,
  type BoqBulkImportItemInput,
  type BoqTemplateSummary,
} from '@/api/hooks/useBoqTemplates';
import type { WorkTypeRow, UomRow } from '@/api/hooks/useMasters';

type RowType =
  | { _type: 'header'; section: BoqSectionRead; key: string }
  | { _type: 'item'; item: BoqItemRead; key: string }
  | { _type: 'subtotal'; section: BoqSectionRead; key: string };

function itemContractValue(item: BoqItemRead): number {
  return parseFloat(item.tendered_qty) * parseFloat(item.rate);
}

function itemRevisedValue(item: BoqItemRead): number {
  return parseFloat(item.current_tendered_qty) * parseFloat(item.current_rate);
}

/** Section total VALUE using current (revised) rate — for the revised contract value column. */
function sectionRevisedAmount(items: BoqItemRead[]): number {
  return items.reduce((acc, i) => acc + parseFloat(i.current_tendered_qty) * parseFloat(i.current_rate), 0);
}

/** Section total VALUE using original rate — for the original contract value column. */
function sectionAmount(items: BoqItemRead[], field: 'tendered_qty' | 'consumed_qty'): number {
  return items.reduce((acc, i) => acc + parseFloat(i[field]) * parseFloat(i.rate), 0);
}

const REVISION_TYPE_LABELS: Record<BoqRevisionType, string> = {
  VARIATION_ORDER: 'Variation Order',
  RATE_AMENDMENT: 'Rate Amendment',
  RECAST_ESTIMATE: 'Recast Estimate',
  QTY_REVISION: 'Qty Revision',
};

const REVISION_STATUS_COLOR: Record<string, string> = {
  PENDING: 'gold',
  APPROVED: 'green',
  REJECTED: 'red',
};

interface RevisionHistoryDrawerProps {
  open: boolean;
  item: BoqItemRead | null;
  isAdmin: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onRejectClick: (r: BoqRevisionRead) => void;
  fmtQty: (v: string | number, decimals?: number) => string;
  symbol: string;
  approveLoading: boolean;
}

function RevisionHistoryDrawer({
  open, item, isAdmin, onClose, onApprove, onRejectClick, fmtQty, symbol, approveLoading,
}: RevisionHistoryDrawerProps) {
  const { data: revisions, isLoading } = useBoqRevisions(item?.id ?? null);

  return (
    <Drawer
      title={`Revision History${item ? ` — ${item.item_no}: ${item.description}` : ''}`}
      open={open}
      onClose={onClose}
      width={560}
      destroyOnHidden
    >
      {isLoading ? (
        <Typography.Text type="secondary">Loading...</Typography.Text>
      ) : (revisions ?? []).length === 0 ? (
        <Typography.Text type="secondary">No revisions yet for this item.</Typography.Text>
      ) : (
        <Timeline
          items={(revisions ?? []).map((r) => ({
            color: REVISION_STATUS_COLOR[r.status] ?? 'blue',
            children: (
              <div key={r.id} style={{ marginBottom: 8 }}>
                <Space wrap>
                  <Typography.Text strong>{r.revision_number}</Typography.Text>
                  <Tag color={REVISION_STATUS_COLOR[r.status] ?? 'blue'}>{r.status}</Tag>
                  <Tag>{REVISION_TYPE_LABELS[r.revision_type]}</Tag>
                </Space>
                <Descriptions size="small" column={2} style={{ marginTop: 6 }}>
                  <Descriptions.Item label="Effective From">{r.effective_from}</Descriptions.Item>
                  {r.revised_rate && <Descriptions.Item label={`Rate (${symbol})`}>{fmtQty(r.revised_rate, 2)}</Descriptions.Item>}
                  {r.revised_tendered_qty && <Descriptions.Item label="Qty">{fmtQty(r.revised_tendered_qty)}</Descriptions.Item>}
                  <Descriptions.Item label="Reason" span={2}>{r.reason}</Descriptions.Item>
                  {r.rejected_reason && <Descriptions.Item label="Rejection reason" span={2}><Typography.Text type="danger">{r.rejected_reason}</Typography.Text></Descriptions.Item>}
                </Descriptions>
                {isAdmin && r.status === 'PENDING' && (
                  <Space style={{ marginTop: 6 }}>
                    <Popconfirm title="Approve this revision?" onConfirm={() => onApprove(r.id)} okText="Approve" okButtonProps={{ type: 'primary' }}>
                      <Button size="small" type="primary" icon={<CheckOutlined />} loading={approveLoading}>Approve</Button>
                    </Popconfirm>
                    <Button size="small" danger icon={<CloseOutlined />} onClick={() => onRejectClick(r)}>Reject</Button>
                  </Space>
                )}
              </div>
            ),
          }))}
        />
      )}
    </Drawer>
  );
}

/** Section total QUANTITY (plain sum, no rate) — belongs under the
 * Tendered Qty / Consumed Qty columns themselves. */
function sectionQty(items: BoqItemRead[], field: 'tendered_qty' | 'consumed_qty'): number {
  return items.reduce((acc, i) => acc + parseFloat(i[field]), 0);
}

interface ItemFormValues {
  section_id: string | null;
  item_no: string;
  description: string;
  work_type_id: string;
  uom_id: string;
  tendered_qty: number;
  rate: number;
  construction_type: BoqConstructionType;
}

const UNSECTIONED_SECTION_ID = '00000000-0000-0000-0000-000000000000';

interface EditItemFormValues {
  section_id: string | null;
  item_no: string;
  description: string;
  work_type_id: string;
  uom_id: string;
  construction_type: BoqConstructionType;
}

interface RevisionFormValues {
  revision_type: BoqRevisionType;
  effective_from: dayjs.Dayjs;
  revised_rate?: number | null;
  revised_tendered_qty?: number | null;
  reason: string;
}

interface SectionFormValues {
  section_no: string;
  section_name: string;
  sort_order: number;
}

interface TemplateNameFormValues {
  name: string;
  description: string;
}

const TEMPLATE_COLUMNS = [
  'section_no',
  'section_name',
  'item_no',
  'description',
  'work_type',
  'uom_code',
  'tendered_qty',
  'rate',
];

function downloadTemplateExcel() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS]);
  wb.SheetNames.push('BOQ');
  wb.Sheets['BOQ'] = ws;
  XLSX.writeFile(wb, 'boq_import_template.xlsx');
}

function exportBoqToExcel(
  sections: BoqSectionRead[],
  workTypeById: Map<string, string>,
  uomById: Map<string, string>,
  projectName?: string,
) {
  const rows: string[][] = [TEMPLATE_COLUMNS];
  for (const section of sections) {
    for (const item of section.items) {
      rows.push([
        section.section_no,
        section.section_name,
        item.item_no,
        item.description,
        workTypeById.get(item.work_type_id) ?? '',
        uomById.get(item.uom_id) ?? '',
        item.tendered_qty,
        item.rate,
      ]);
    }
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  wb.SheetNames.push('BOQ');
  wb.Sheets['BOQ'] = ws;
  const filename = projectName ? `boq_${projectName.replace(/\s+/g, '_')}.xlsx` : 'boq_export.xlsx';
  XLSX.writeFile(wb, filename);
}

interface ParsedRow {
  section_no: string;
  section_name: string;
  item_no: string;
  description: string;
  work_type: string;
  uom_code: string;
  tendered_qty: string;
  rate: string;
}

function parseImportFile(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        const rows = raw.map((r) => ({
          section_no: String(r['section_no'] ?? '').trim(),
          section_name: String(r['section_name'] ?? '').trim(),
          item_no: String(r['item_no'] ?? '').trim(),
          description: String(r['description'] ?? '').trim(),
          work_type: String(r['work_type'] ?? '').trim(),
          uom_code: String(r['uom_code'] ?? '').trim(),
          tendered_qty: String(r['tendered_qty'] ?? '').trim(),
          rate: String(r['rate'] ?? '').trim(),
        }));
        resolve(rows.filter((r) => r.item_no));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsArrayBuffer(file);
  });
}

function resolveImportRows(
  rows: ParsedRow[],
  workTypes: WorkTypeRow[],
  uoms: UomRow[],
): { items: BoqBulkImportItemInput[]; errors: string[] } {
  const wtByName = new Map(workTypes.map((w) => [w.name.toLowerCase(), w.id]));
  const uomByCode = new Map(uoms.map((u) => [u.code.toLowerCase(), u.id]));
  const items: BoqBulkImportItemInput[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowLabel = `Row ${i + 2}`;
    const work_type_id = wtByName.get(r.work_type.toLowerCase());
    if (!work_type_id) { errors.push(`${rowLabel}: Unknown work type "${r.work_type}"`); continue; }
    const uom_id = uomByCode.get(r.uom_code.toLowerCase());
    if (!uom_id) { errors.push(`${rowLabel}: Unknown UOM code "${r.uom_code}"`); continue; }
    const tendered_qty = parseFloat(r.tendered_qty);
    if (isNaN(tendered_qty) || tendered_qty <= 0) { errors.push(`${rowLabel}: Invalid tendered_qty "${r.tendered_qty}"`); continue; }
    const rate = parseFloat(r.rate);
    if (isNaN(rate) || rate < 0) { errors.push(`${rowLabel}: Invalid rate "${r.rate}"`); continue; }
    if (!r.description) { errors.push(`${rowLabel}: Missing description`); continue; }
    items.push({
      section_no: r.section_no || null,
      section_name: r.section_name || null,
      item_no: r.item_no,
      description: r.description,
      work_type_id,
      uom_id,
      tendered_qty: String(tendered_qty),
      rate: String(rate),
    });
  }
  return { items, errors };
}

export function BoqPage() {
  const isMobile = useIsMobile();
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';
  const { data: sections, isLoading } = useBoqSections(selectedProjectId);
  const { data: workTypes } = useWorkTypes();
  const { data: uoms } = useUoms();
  const createItem = useCreateBoqItem();
  const updateItem = useUpdateBoqItem();
  const deleteItem = useDeleteBoqItem();
  const createSection = useCreateBoqSection();
  const updateSection = useUpdateBoqSection();
  const deleteSection = useDeleteBoqSection();
  const createRevision = useCreateBoqRevision();
  const approveRevision = useApproveBoqRevision();
  const rejectRevision = useRejectBoqRevision();
  const { data: pendingRevisions } = usePendingBoqRevisions(isAdmin ? selectedProjectId : null);
  const { resolvedMode } = useThemeMode();
  const { fmtAmt, fmtQty, fmtQtyByUnit, symbol } = useNumberFormat();
  const { dateFormat } = useDateFormat();

  const { data: templates, isLoading: templatesLoading } = useBoqTemplateList();
  const saveFromProject = useSaveBoqTemplateFromProject();
  const applyTemplate = useApplyBoqTemplate();
  const deleteTemplate = useDeleteBoqTemplate();
  const boqImport = useBoqImport();

  const SECTION_HEADER_BG = resolvedMode === 'dark' ? 'rgba(22, 119, 255, 0.10)' : '#f0f5ff';
  const SUBTOTAL_BG = resolvedMode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : '#fafafa';

  const [itemModal, setItemModal] = useState<{ open: boolean; defaultSectionId?: string }>({ open: false });
  const [editItemModal, setEditItemModal] = useState<{ open: boolean; item?: BoqItemRead }>({ open: false });
  const [sectionModal, setSectionModal] = useState<{ open: boolean; editing?: BoqSectionRead }>({ open: false });
  const [revisionModal, setRevisionModal] = useState<{ open: boolean; item?: BoqItemRead }>({ open: false });
  const [revisionHistoryDrawer, setRevisionHistoryDrawer] = useState<{ open: boolean; item?: BoqItemRead }>({ open: false });
  const [rejectDrawerRevision, setRejectDrawerRevision] = useState<BoqRevisionRead | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [importModal, setImportModal] = useState(false);
  const [saveTemplateModal, setSaveTemplateModal] = useState(false);
  const [applyTemplateModal, setApplyTemplateModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [templateSearchText, setTemplateSearchText] = useState('');

  const [importParsed, setImportParsed] = useState<BoqBulkImportItemInput[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [itemForm] = Form.useForm<ItemFormValues>();
  const [editItemForm] = Form.useForm<EditItemFormValues>();
  const [sectionForm] = Form.useForm<SectionFormValues>();
  const [saveTemplateForm] = Form.useForm<TemplateNameFormValues>();
  const [revisionForm] = Form.useForm<RevisionFormValues>();

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
        construction_type: values.construction_type ?? 'GENERAL',
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
      construction_type: item.construction_type ?? 'GENERAL',
    });
    setEditItemModal({ open: true, item });
  };

  const handleEditItem = async (values: EditItemFormValues) => {
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
          construction_type: values.construction_type,
        },
      });
      message.success('BOQ item updated');
      setEditItemModal({ open: false });
    } catch {
      message.error('Could not update BOQ item');
    }
  };

  const openRevisionModal = (item: BoqItemRead) => {
    revisionForm.resetFields();
    setRevisionModal({ open: true, item });
  };

  const handleCreateRevision = async (values: RevisionFormValues) => {
    if (!revisionModal.item) return;
    const data: BoqRevisionCreateInput = {
      revision_type: values.revision_type,
      effective_from: values.effective_from.format('YYYY-MM-DD'),
      revised_rate: values.revised_rate != null ? String(values.revised_rate) : null,
      revised_tendered_qty: values.revised_tendered_qty != null ? String(values.revised_tendered_qty) : null,
      reason: values.reason,
    };
    try {
      await createRevision.mutateAsync({ boqItemId: revisionModal.item.id, data });
      message.success('Revision submitted for approval');
      setRevisionModal({ open: false });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      message.error(detail ?? 'Could not create revision');
    }
  };

  const handleApproveRevision = async (id: string) => {
    try {
      await approveRevision.mutateAsync(id);
      message.success('Revision approved');
    } catch {
      message.error('Could not approve revision');
    }
  };

  const handleRejectRevision = async () => {
    if (!rejectDrawerRevision || !rejectReason.trim()) return;
    try {
      await rejectRevision.mutateAsync({ revisionId: rejectDrawerRevision.id, rejected_reason: rejectReason.trim() });
      message.success('Revision rejected');
      setRejectDrawerRevision(null);
      setRejectReason('');
    } catch {
      message.error('Could not reject revision');
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportErrors([]);
    setImportParsed([]);
    try {
      const rows = await parseImportFile(file);
      if (rows.length === 0) {
        setImportErrors(['No data rows found in file.']);
        return;
      }
      const { items, errors } = resolveImportRows(rows, workTypes ?? [], uoms ?? []);
      setImportParsed(items);
      setImportErrors(errors);
    } catch {
      setImportErrors(['Failed to parse file. Ensure it is a valid .xlsx or .csv file.']);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImportConfirm = async () => {
    if (!selectedProjectId || importParsed.length === 0) return;
    try {
      const result = await boqImport.mutateAsync({ projectId: selectedProjectId, items: importParsed });
      message.success(
        `Import complete: ${result.added_items} items added, ${result.added_sections} sections created, ${result.skipped_items} skipped.`,
      );
      setImportModal(false);
      setImportParsed([]);
      setImportErrors([]);
      setImportFileName('');
    } catch {
      message.error('Import failed. Please try again.');
    }
  };

  const handleSaveTemplate = async (values: TemplateNameFormValues) => {
    if (!selectedProjectId) return;
    try {
      await saveFromProject.mutateAsync({
        projectId: selectedProjectId,
        data: { name: values.name, description: values.description || null },
      });
      message.success('Template saved');
      setSaveTemplateModal(false);
      saveTemplateForm.resetFields();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      message.error(msg ?? 'Could not save template');
    }
  };

  const handleApplyTemplate = async () => {
    if (!selectedTemplateId || !selectedProjectId) return;
    try {
      const result = await applyTemplate.mutateAsync({ templateId: selectedTemplateId, projectId: selectedProjectId });
      message.success(
        `Template applied: ${result.added_items} items added, ${result.added_sections} sections created, ${result.skipped_items} skipped.`,
      );
      setApplyTemplateModal(false);
      setSelectedTemplateId(null);
    } catch {
      message.error('Could not apply template');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await deleteTemplate.mutateAsync(id);
      message.success('Template deleted');
    } catch {
      message.error('Could not delete template');
    }
  };

  // Keep a section wholesale (all its original items, so the existing
  // subtotal computation — which reads row.section.items directly — stays
  // correct) if its name or any item's no/description matches the search.
  const boqSearchQuery = searchText.trim().toLowerCase();
  const filteredSections = !boqSearchQuery
    ? sections ?? []
    : (sections ?? []).filter((section) =>
        section.section_name.toLowerCase().includes(boqSearchQuery) ||
        section.items.some((item) =>
          item.item_no.toLowerCase().includes(boqSearchQuery) || item.description.toLowerCase().includes(boqSearchQuery),
        ),
      );

  const tableRows: RowType[] = [];
  for (const section of filteredSections) {
    tableRows.push({ _type: 'header', section, key: `hdr-${section.id}` });
    for (const item of section.items) {
      tableRows.push({ _type: 'item', item, key: item.id });
    }
    tableRows.push({ _type: 'subtotal', section, key: `sub-${section.id}` });
  }

  const NCOLS = 13;
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
          const isUnsectioned = row.section.id === UNSECTIONED_SECTION_ID;
          return (
            <Space>
              <Typography.Text strong style={{ fontSize: 13 }}>
                {isUnsectioned ? row.section.section_name.toUpperCase() : `${row.section.section_no}. ${row.section.section_name.toUpperCase()}`}
              </Typography.Text>
              <Tag color="blue" style={{ marginLeft: 8 }}>
                {row.section.items.length} items
              </Tag>
              {!isUnsectioned && (
                <>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => openAddItem(row.section.id)}>
                    {!isMobile && 'Add Item'}
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
                </>
              )}
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
      width: 280,
      ellipsis: true,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { colSpan: 0 };
        return {};
      },
      render: (_, row) => {
        if (row._type !== 'item') return null;
        const ct = row.item.construction_type ?? 'GENERAL';
        return (
          <Space direction="vertical" size={2}>
            <span>{row.item.description}</span>
            {ct !== 'GENERAL' && (
              <Tag color={CONSTRUCTION_TYPE_COLORS[ct]} style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
                {CONSTRUCTION_TYPE_LABELS[ct] ?? ct}
              </Tag>
            )}
          </Space>
        );
      },
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
        if (row._type === 'item') return fmtQtyByUnit(row.item.tendered_qty, row.item.unit);
        if (row._type === 'subtotal') return fmtQty(sectionQty(row.section.items, 'tendered_qty'));
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
        if (row._type === 'item') return fmtQtyByUnit(row.item.consumed_qty, row.item.unit);
        if (row._type === 'subtotal') return fmtQty(sectionQty(row.section.items, 'consumed_qty'));
        return null;
      },
    },
    {
      title: `Contract Rate (${symbol})`,
      key: 'rate',
      width: 110,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { style: { background: SUBTOTAL_BG } };
        return {};
      },
      render: (_, row) => (row._type === 'item' ? fmtQty(row.item.rate, 2) : null),
    },
    {
      title: `Revised Rate (${symbol})`,
      key: 'current_rate',
      width: 110,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { style: { background: SUBTOTAL_BG } };
        return {};
      },
      render: (_, row) => {
        if (row._type !== 'item') return null;
        const isRevised = row.item.current_rate !== row.item.rate;
        return isRevised ? (
          <Space size={4}>
            <Tag color="orange" style={{ marginRight: 0 }}>Revised</Tag>
            {fmtQty(row.item.current_rate, 2)}
          </Space>
        ) : <Typography.Text type="secondary">—</Typography.Text>;
      },
    },
    {
      title: 'Revised Qty',
      key: 'current_tendered_qty',
      width: 100,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { style: { background: SUBTOTAL_BG } };
        return {};
      },
      render: (_, row) => {
        if (row._type !== 'item') return null;
        const isRevised = row.item.current_tendered_qty !== row.item.tendered_qty;
        return isRevised ? (
          <Space size={4}>
            <Tag color="orange" style={{ marginRight: 0 }}>Revised</Tag>
            {fmtQtyByUnit(row.item.current_tendered_qty, row.item.unit)}
          </Space>
        ) : <Typography.Text type="secondary">—</Typography.Text>;
      },
    },
    {
      title: 'Contract Value',
      key: 'tendered_value',
      width: 130,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { style: { background: SUBTOTAL_BG, fontWeight: 600, textAlign: 'right' } };
        return {};
      },
      render: (_, row) => {
        if (row._type === 'item') return fmtAmt(itemContractValue(row.item));
        if (row._type === 'subtotal') return fmtAmt(sectionAmount(row.section.items, 'tendered_qty'));
        return null;
      },
    },
    {
      title: 'Revised Value',
      key: 'revised_value',
      width: 130,
      align: 'right' as const,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { style: { background: SUBTOTAL_BG, fontWeight: 600, textAlign: 'right' } };
        return {};
      },
      render: (_, row) => {
        if (row._type === 'item') {
          const isRevised = row.item.current_rate !== row.item.rate || row.item.current_tendered_qty !== row.item.tendered_qty;
          return isRevised ? fmtAmt(itemRevisedValue(row.item)) : <Typography.Text type="secondary">—</Typography.Text>;
        }
        if (row._type === 'subtotal') {
          const revisedTotal = sectionRevisedAmount(row.section.items);
          const originalTotal = sectionAmount(row.section.items, 'tendered_qty');
          return revisedTotal !== originalTotal ? fmtAmt(revisedTotal) : <Typography.Text type="secondary">—</Typography.Text>;
        }
        return null;
      },
    },
    {
      title: 'Revisions',
      key: 'revisions',
      width: 85,
      align: 'center' as const,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { style: { background: SUBTOTAL_BG } };
        return {};
      },
      render: (_, row) => {
        if (row._type !== 'item') return null;
        return (
          <Badge count={row.item.revision_count} size="small">
            <Button
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => setRevisionHistoryDrawer({ open: true, item: row.item })}
            />
          </Badge>
        );
      },
    },
    {
      title: 'Actions',
      key: 'item_actions',
      width: 120,
      onCell: (row) => {
        if (row._type === 'header') return { colSpan: 0 };
        if (row._type === 'subtotal') return { style: { background: SUBTOTAL_BG } };
        return {};
      },
      render: (_, row) => {
        if (row._type !== 'item') return null;
        return (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditItem(row.item)} />
            <Button size="small" icon={<ToolOutlined />} title="Revise rate/qty" onClick={() => openRevisionModal(row.item)} />
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

  const sectionOptions = (sections ?? [])
    .filter((s) => s.id !== UNSECTIONED_SECTION_ID)
    .map((s) => ({
      value: s.id,
      label: `${s.section_no}. ${s.section_name}`,
    }));

  const templateColumns: TableColumnsType<BoqTemplateSummary> = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (v: string | null) => v ?? '—',
    },
    { title: 'Items', dataIndex: 'item_count', key: 'item_count', width: 80, align: 'right' as const },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_, tpl) => (
        <Space>
          <Button
            size="small"
            icon={<AppstoreAddOutlined />}
            disabled={!selectedProjectId}
            onClick={() => {
              setSelectedTemplateId(tpl.id);
              setApplyTemplateModal(true);
            }}
          >
            Apply
          </Button>
          <Popconfirm
            title="Delete this template?"
            onConfirm={() => handleDeleteTemplate(tpl.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const boqTab = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <ProjectSelector />
          <Input.Search
            placeholder="Search by item no, description, or section"
            allowClear
            style={{ width: 260 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Button icon={<PlusOutlined />} disabled={!selectedProjectId} onClick={openAddSection}>
            {!isMobile && 'Add Section'}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} disabled={!selectedProjectId} onClick={() => openAddItem()}>
            {!isMobile && 'Add BOQ Item'}
          </Button>
        </Space>
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={downloadTemplateExcel}>
            Download Template
          </Button>
          <Button
            icon={<ImportOutlined />}
            disabled={!selectedProjectId}
            onClick={() => {
              setImportParsed([]);
              setImportErrors([]);
              setImportFileName('');
              setImportModal(true);
            }}
          >
            Import
          </Button>
          <Button
            icon={<ExportOutlined />}
            disabled={!selectedProjectId || (sections ?? []).length === 0}
            onClick={() => exportBoqToExcel(sections ?? [], workTypeById, uomById)}
          >
            Export
          </Button>
          <Button
            icon={<AppstoreAddOutlined />}
            disabled={!selectedProjectId || (templates ?? []).length === 0}
            onClick={() => setApplyTemplateModal(true)}
          >
            Apply Template
          </Button>
          <Button
            icon={<SaveOutlined />}
            disabled={!selectedProjectId || (sections ?? []).flatMap((s) => s.items).length === 0}
            onClick={() => {
              saveTemplateForm.resetFields();
              setSaveTemplateModal(true);
            }}
          >
            Save as Template
          </Button>
        </Space>
      </div>

      {selectedProjectId && (sections ?? []).length === 0 && !isLoading && (
        <Typography.Text type="secondary">
          No sections yet. Create a section first, then add BOQ items to it.
        </Typography.Text>
      )}

      {isAdmin && selectedProjectId && (pendingRevisions ?? []).length > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 16px', border: '1px solid #faad14', borderRadius: 6, background: resolvedMode === 'dark' ? 'rgba(250,173,20,0.08)' : '#fffbe6' }}>
          <Typography.Text strong style={{ color: '#d48806' }}>
            {pendingRevisions!.length} pending BOQ revision(s) awaiting approval
          </Typography.Text>
          <Table
            rowKey="id"
            size="small"
            dataSource={pendingRevisions}
            pagination={false}
            style={{ marginTop: 8 }}
            columns={[
              { title: 'Item', dataIndex: 'revision_number', key: 'rn', width: 100 },
              { title: 'Type', key: 'type', width: 130, render: (_: unknown, r: BoqRevisionRead) => REVISION_TYPE_LABELS[r.revision_type] },
              { title: 'Effective From', dataIndex: 'effective_from', key: 'eff', width: 120 },
              { title: 'Revised Rate', key: 'rrate', width: 110, align: 'right' as const, render: (_: unknown, r: BoqRevisionRead) => r.revised_rate ? fmtQty(r.revised_rate, 2) : '—' },
              { title: 'Revised Qty', key: 'rqty', width: 110, align: 'right' as const, render: (_: unknown, r: BoqRevisionRead) => r.revised_tendered_qty ? fmtQty(r.revised_tendered_qty) : '—' },
              { title: 'Reason', dataIndex: 'reason', key: 'reason', ellipsis: true },
              {
                title: 'Actions',
                key: 'pa',
                width: 140,
                render: (_: unknown, r: BoqRevisionRead) => (
                  <Space>
                    <Popconfirm title="Approve this revision?" onConfirm={() => handleApproveRevision(r.id)} okText="Approve" okButtonProps={{ type: 'primary' }}>
                      <Button size="small" type="primary" icon={<CheckOutlined />}>Approve</Button>
                    </Popconfirm>
                    <Button
                      size="small"
                      danger
                      icon={<CloseOutlined />}
                      onClick={() => { setRejectDrawerRevision(r); setRejectReason(''); }}
                    >
                      Reject
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </div>
      )}

      <Table
        rowKey="key"
        loading={isLoading}
        dataSource={tableRows}
        columns={columns}
        pagination={false}
        bordered
        size="small"
        scroll={{ x: 1600 }}
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
    </div>
  );

  const filteredTemplates = (templates ?? []).filter((t) => {
    const q = templateSearchText.trim().toLowerCase();
    if (!q) return true;
    return t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q);
  });

  const templatesTab = (
    <div>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        Templates are shared across projects. Apply a template to add all its items to the current project in one click.
      </Typography.Text>
      <Input.Search
        placeholder="Search by template name or description"
        allowClear
        style={{ width: 280, marginBottom: 12 }}
        value={templateSearchText}
        onChange={(e) => setTemplateSearchText(e.target.value)}
      />
      <Table
        rowKey="id"
        loading={templatesLoading}
        dataSource={filteredTemplates}
        columns={templateColumns}
        pagination={false}
        bordered
        size="small"
        scroll={{ x: 540 }}
        locale={{ emptyText: 'No templates yet. Save a project BOQ as a template to get started.' }}
      />
    </div>
  );

  return (
    <div>
      <Typography.Title level={3} style={{ margin: '0 0 16px 0' }}>
        BOQ & Approved Quantities
      </Typography.Title>

      <Tabs
        items={[
          { key: 'boq', label: 'BOQ', children: boqTab },
          { key: 'templates', label: 'Templates', children: templatesTab },
        ]}
      />

      {/* Section modal */}
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

      {/* Add item modal */}
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
            <Select allowClear showSearch optionFilterProp="label" placeholder="Select section (optional)" options={sectionOptions} />
          </Form.Item>
          <Form.Item name="item_no" label="Item No" rules={[{ required: true }]}>
            <Input placeholder="e.g. 1.005" />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="work_type_id" label="Work Type" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(workTypes ?? []).map((w) => ({ value: w.id, label: w.name }))} />
          </Form.Item>
          <Form.Item name="uom_id" label="Unit of Measure" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(uoms ?? []).map((u) => ({ value: u.id, label: `${u.code} — ${u.name}` }))} />
          </Form.Item>
          <Form.Item name="tendered_qty" label="Tendered Quantity" rules={[{ required: true }]}>
            <InputNumber min={0.001} step={0.001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="rate" label={`Rate (${symbol})`} rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="construction_type" label="Construction Type" initialValue="GENERAL">
            <Select
              options={(Object.entries(CONSTRUCTION_TYPE_LABELS) as [BoqConstructionType, string][]).map(([v, l]) => ({
                value: v,
                label: (
                  <Space size={4}>
                    <Tag color={CONSTRUCTION_TYPE_COLORS[v]} style={{ margin: 0 }}>{l}</Tag>
                  </Space>
                ),
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit item modal */}
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
            <Select allowClear showSearch optionFilterProp="label" placeholder="Select section (optional)" options={sectionOptions} />
          </Form.Item>
          <Form.Item name="item_no" label="Item No" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="work_type_id" label="Work Type" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(workTypes ?? []).map((w) => ({ value: w.id, label: w.name }))} />
          </Form.Item>
          <Form.Item name="uom_id" label="Unit of Measure" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={(uoms ?? []).map((u) => ({ value: u.id, label: `${u.code} — ${u.name}` }))} />
          </Form.Item>
          <Form.Item name="construction_type" label="Construction Type" initialValue="GENERAL">
            <Select
              options={(Object.entries(CONSTRUCTION_TYPE_LABELS) as [BoqConstructionType, string][]).map(([v, l]) => ({
                value: v,
                label: (
                  <Space size={4}>
                    <Tag color={CONSTRUCTION_TYPE_COLORS[v]} style={{ margin: 0 }}>{l}</Tag>
                  </Space>
                ),
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Import modal */}
      <Modal
        title="Import BOQ from Excel"
        open={importModal}
        onCancel={() => setImportModal(false)}
        onOk={handleImportConfirm}
        okText="Import"
        okButtonProps={{ disabled: importParsed.length === 0, loading: boqImport.isPending }}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            Upload an Excel (.xlsx) or CSV file with columns:{' '}
            <code>section_no, section_name, item_no, description, work_type, uom_code, tendered_qty, rate</code>.
            Download the template for the correct format.
          </Typography.Text>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <Button icon={<ImportOutlined />} onClick={() => fileInputRef.current?.click()}>
            Choose File
          </Button>
          {importFileName && (
            <Typography.Text>Selected: {importFileName}</Typography.Text>
          )}
          {importErrors.length > 0 && (
            <div>
              <Typography.Text type="danger">
                {importErrors.length} error(s) found — these rows will be skipped:
              </Typography.Text>
              <ul style={{ marginTop: 4, paddingLeft: 16 }}>
                {importErrors.map((e, i) => (
                  <li key={i}><Typography.Text type="danger" style={{ fontSize: 12 }}>{e}</Typography.Text></li>
                ))}
              </ul>
            </div>
          )}
          {importParsed.length > 0 && (
            <Typography.Text type="success">
              {importParsed.length} valid row(s) ready to import.
            </Typography.Text>
          )}
        </Space>
      </Modal>

      {/* Save as Template modal */}
      <Modal
        title="Save BOQ as Template"
        open={saveTemplateModal}
        onCancel={() => setSaveTemplateModal(false)}
        onOk={() => saveTemplateForm.submit()}
        confirmLoading={saveFromProject.isPending}
        destroyOnHidden
      >
        <Form form={saveTemplateForm} layout="vertical" onFinish={handleSaveTemplate}>
          <Form.Item name="name" label="Template Name" rules={[{ required: true, max: 200 }]}>
            <Input placeholder="e.g. Standard Road Package" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional description" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Apply Template modal */}
      <Modal
        title="Apply Template to Project"
        open={applyTemplateModal}
        onCancel={() => { setApplyTemplateModal(false); setSelectedTemplateId(null); }}
        onOk={handleApplyTemplate}
        okText="Apply"
        okButtonProps={{ disabled: !selectedTemplateId, loading: applyTemplate.isPending }}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            Existing items with the same item_no will be skipped. New sections will be created as needed.
          </Typography.Text>
          <Select
            style={{ width: '100%' }}
            placeholder="Select a template"
            value={selectedTemplateId}
            onChange={setSelectedTemplateId}
            showSearch
            optionFilterProp="label"
            options={(templates ?? []).map((t) => ({
              value: t.id,
              label: `${t.name} (${t.item_count} items)`,
            }))}
          />
        </Space>
      </Modal>

      {/* Create Revision modal */}
      <Modal
        title={`Revise BOQ Item${revisionModal.item ? ` — ${revisionModal.item.item_no}` : ''}`}
        open={revisionModal.open}
        onCancel={() => setRevisionModal({ open: false })}
        onOk={() => revisionForm.submit()}
        confirmLoading={createRevision.isPending}
        destroyOnHidden
        width={520}
      >
        {revisionModal.item && (
          <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Contract Rate">{fmtQty(revisionModal.item.rate, 2)}</Descriptions.Item>
            <Descriptions.Item label="Current Rate">{fmtQty(revisionModal.item.current_rate, 2)}</Descriptions.Item>
            <Descriptions.Item label="Contract Qty">{fmtQtyByUnit(revisionModal.item.tendered_qty, revisionModal.item.unit)}</Descriptions.Item>
            <Descriptions.Item label="Current Qty">{fmtQtyByUnit(revisionModal.item.current_tendered_qty, revisionModal.item.unit)}</Descriptions.Item>
          </Descriptions>
        )}
        <Form form={revisionForm} layout="vertical" onFinish={handleCreateRevision}>
          <Form.Item name="revision_type" label="Revision Type" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'VARIATION_ORDER', label: 'Variation Order (VO)' },
                { value: 'RATE_AMENDMENT', label: 'Rate Amendment (RA)' },
                { value: 'RECAST_ESTIMATE', label: 'Recast Estimate (RE)' },
                { value: 'QTY_REVISION', label: 'Quantity Revision (QR)' },
              ]}
            />
          </Form.Item>
          <Form.Item name="effective_from" label="Effective From Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format={dateFormat} />
          </Form.Item>
          <Form.Item
            name="revised_rate"
            label={`Revised Rate (${symbol}) — leave blank to keep current`}
            dependencies={['revised_tendered_qty']}
            rules={[{
              validator: async (_, value) => {
                const qty = revisionForm.getFieldValue('revised_tendered_qty');
                if ((value == null) && (qty == null)) {
                  throw new Error('Provide at least one: Revised Rate or Revised Qty');
                }
              },
            }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="revised_tendered_qty"
            label="Revised Tendered Qty — leave blank to keep current"
            dependencies={['revised_rate']}
            rules={[{
              validator: async (_, value) => {
                const rate = revisionForm.getFieldValue('revised_rate');
                if ((value == null) && (rate == null)) {
                  throw new Error('Provide at least one: Revised Rate or Revised Qty');
                }
              },
            }]}
          >
            <InputNumber min={0.001} step={0.001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reason" label="Reason / Justification" rules={[{ required: true, min: 1 }]}>
            <Input.TextArea rows={3} placeholder="Describe the reason for this revision" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Revision History Drawer */}
      <RevisionHistoryDrawer
        open={revisionHistoryDrawer.open}
        item={revisionHistoryDrawer.item ?? null}
        isAdmin={isAdmin}
        onClose={() => setRevisionHistoryDrawer({ open: false })}
        onApprove={handleApproveRevision}
        onRejectClick={(r) => { setRejectDrawerRevision(r); setRejectReason(''); }}
        fmtQty={fmtQty}
        symbol={symbol}
        approveLoading={approveRevision.isPending}
      />

      {/* Reject Reason modal */}
      <Modal
        title="Reject Revision"
        open={!!rejectDrawerRevision}
        onCancel={() => { setRejectDrawerRevision(null); setRejectReason(''); }}
        onOk={handleRejectRevision}
        okText="Reject"
        okButtonProps={{ danger: true, disabled: !rejectReason.trim(), loading: rejectRevision.isPending }}
        destroyOnHidden
      >
        <Typography.Text>Please provide a reason for rejecting this revision:</Typography.Text>
        <Input.TextArea
          rows={3}
          style={{ marginTop: 8 }}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Reason for rejection"
        />
      </Modal>
    </div>
  );
}
