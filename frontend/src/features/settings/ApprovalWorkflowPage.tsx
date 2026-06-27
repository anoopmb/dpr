import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, PlusOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { isAxiosError } from 'axios';
import {
  useCreateWorkflowDefinition,
  useDeleteWorkflowDefinition,
  useUpdateWorkflowDefinition,
  useWorkflowDefinitions,
  type WorkflowDefinitionRead,
  type WorkflowEntityType,
  type WorkflowStageInput,
} from '@/api/hooks/useWorkflowConfig';
import { useProjects } from '@/api/hooks/useProjects';
import { ROLE_LABELS } from '@/utils/roles';
import type { UserRole } from '@/store/auth-store';

const ALL_ROLES: UserRole[] = ['SITE_ENGINEER', 'PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'STORE_KEEPER', 'ADMIN'];
const ROLE_OPTIONS = ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

function errorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err) && typeof err.response?.data?.message === 'string') return err.response.data.message;
  return fallback;
}

let _levelSeq = 0;
const nextLevelKey = () => `lvl-${++_levelSeq}`;

interface EditableLevel extends WorkflowStageInput {
  key: string;
}

function toEditable(levels: WorkflowStageInput[]): EditableLevel[] {
  return levels.map((l) => ({ ...l, key: nextLevelKey() }));
}

function WorkflowEditor({
  entityType,
  definitions,
  selectedProjectId,
}: {
  entityType: WorkflowEntityType;
  definitions: WorkflowDefinitionRead[];
  selectedProjectId: string | null;
}) {
  // entityType/selectedProjectId are this component's React `key` (set by
  // the parent), so a remount — not an effect — is what re-syncs local
  // editable state whenever the viewed definition changes.
  const orgDefault = definitions.find((d) => d.is_org_default)!;
  const override = selectedProjectId ? definitions.find((d) => d.project_id === selectedProjectId) : undefined;
  const viewing = override ?? orgDefault;

  const createDefinition = useCreateWorkflowDefinition();
  const updateDefinition = useUpdateWorkflowDefinition();
  const deleteDefinition = useDeleteWorkflowDefinition();

  const [approvalsEnabled, setApprovalsEnabled] = useState(viewing.approvals_enabled);
  const [levels, setLevels] = useState<EditableLevel[]>(() => toEditable(viewing.levels));

  const patchLevel = (key: string, patch: Partial<EditableLevel>) =>
    setLevels((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const setFinalLevel = (key: string) =>
    setLevels((prev) =>
      prev.map((l) => ({
        ...l,
        is_final_approval: l.key === key,
        status_code: l.key === key && entityType === 'DPR_HEADER' ? 'APPROVED' : l.status_code,
      })),
    );

  const removeLevel = (key: string) => setLevels((prev) => prev.filter((l) => l.key !== key));

  const moveLevel = (key: string, direction: -1 | 1) =>
    setLevels((prev) => {
      const idx = prev.findIndex((l) => l.key === key);
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  const addLevel = () =>
    setLevels((prev) => [
      ...prev,
      {
        key: nextLevelKey(),
        status_code: '',
        label: `Level ${prev.length + 1}`,
        allowed_roles: [],
        allow_reject: true,
        feeds_production: false,
        is_final_approval: prev.length === 0,
      },
    ]);

  const handleSave = async () => {
    if (levels.some((l) => !l.status_code.trim() || !l.label.trim() || l.allowed_roles.length === 0)) {
      message.warning('Every level needs a status code, label, and at least one allowed role');
      return;
    }
    const payloadLevels: WorkflowStageInput[] = levels.map((l): WorkflowStageInput => ({
      status_code: l.status_code,
      label: l.label,
      allowed_roles: l.allowed_roles,
      allow_reject: l.allow_reject,
      feeds_production: false,
      is_final_approval: l.is_final_approval,
    }));
    try {
      if (viewing) {
        await updateDefinition.mutateAsync({
          id: viewing.id,
          data: {
            approvals_enabled: approvalsEnabled,
            levels: payloadLevels,
          },
        });
      } else if (selectedProjectId) {
        await createDefinition.mutateAsync({
          entity_type: 'DPR_HEADER',
          project_id: selectedProjectId,
          name: 'DPR Approval Override',
          approvals_enabled: approvalsEnabled,
          levels: payloadLevels,
        });
      }
      message.success('Workflow saved');
    } catch (err) {
      message.error(errorMessage(err, 'Could not save workflow'));
    }
  };

  const handleResetToDefault = async () => {
    if (!override) return;
    try {
      await deleteDefinition.mutateAsync(override.id);
      message.success('Reverted to org-wide default');
    } catch (err) {
      message.error(errorMessage(err, 'Could not reset to default'));
    }
  };

  const isProjectView = !!selectedProjectId;
  const hasOverride = !!override;

  return (
    <Card
      size="small"
      title={
        <Space>
          <span>DPR Approval</span>
          {isProjectView && (
            <Tag color={hasOverride ? 'blue' : 'default'}>{hasOverride ? 'Project override' : 'Using org default'}</Tag>
          )}
        </Space>
      }
      extra={
        isProjectView && hasOverride ? (
          <Popconfirm title="Revert this project to the org-wide default?" onConfirm={handleResetToDefault} okText="Reset">
            <Button size="small" danger loading={deleteDefinition.isPending}>Reset to org default</Button>
          </Popconfirm>
        ) : null
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Switch checked={approvalsEnabled} onChange={setApprovalsEnabled} />
          <Typography.Text>
            Approvals enabled
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
              {approvalsEnabled
                ? 'Records must pass through the levels below before they count as approved.'
                : 'Off — submitting a record auto-finalizes it immediately, skipping every level below.'}
            </Typography.Text>
          </Typography.Text>
        </div>

        {false && (
          <div>
            <Select
              mode="multiple"
              style={{ width: '100%', maxWidth: 480 }}
              value={lockAllowedRoles}
              onChange={(v) => setLockAllowedRoles(v)}
              options={ROLE_OPTIONS}
              placeholder="Select role(s)"
            />
          </div>
        )}

        <div>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
            Approval levels
          </Typography.Text>
          {levels.length === 0 && <Empty description="No levels configured — approvals are effectively skipped" />}
          <Space direction="vertical" style={{ width: '100%' }}>
            {levels.map((level, i) => (
              <div
                key={level.key}
                style={{ border: '1px solid var(--ant-color-border-secondary, #303030)', borderRadius: 8, padding: 12 }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <Typography.Text type="secondary" style={{ width: 60 }}>Level {i + 1}</Typography.Text>
                  <Input
                    style={{ width: 160 }}
                    placeholder="Label (e.g. PM Approval)"
                    value={level.label}
                    onChange={(e) => patchLevel(level.key, { label: e.target.value })}
                  />
                  <Input
                    style={{ width: 160 }}
                    placeholder="Status code"
                    value={level.status_code}
                    disabled={entityType === 'DPR_HEADER' && level.is_final_approval}
                    onChange={(e) => patchLevel(level.key, { status_code: e.target.value.toUpperCase() })}
                  />
                  <Select
                    mode="multiple"
                    style={{ width: 220 }}
                    placeholder="Allowed roles"
                    value={level.allowed_roles}
                    onChange={(v) => patchLevel(level.key, { allowed_roles: v })}
                    options={ROLE_OPTIONS}
                  />
                  <Space size={4}>
                    <Button size="small" icon={<UpOutlined />} disabled={i === 0} onClick={() => moveLevel(level.key, -1)} />
                    <Button size="small" icon={<DownOutlined />} disabled={i === levels.length - 1} onClick={() => moveLevel(level.key, 1)} />
                    <Popconfirm title="Remove this level?" onConfirm={() => removeLevel(level.key)} okText="Remove">
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </div>
                <div style={{ display: 'flex', gap: 20, marginTop: 8, flexWrap: 'wrap' }}>
                  <Space size={6}>
                    <Switch size="small" checked={level.allow_reject} onChange={(v) => patchLevel(level.key, { allow_reject: v })} />
                    <Typography.Text style={{ fontSize: 12 }}>Allow reject at this level</Typography.Text>
                  </Space>
                  <Space size={6}>
                    <Switch size="small" checked={level.is_final_approval} onChange={() => setFinalLevel(level.key)} />
                    <Typography.Text style={{ fontSize: 12 }}>
                      Final approval level (locks status_code to APPROVED)
                    </Typography.Text>
                  </Space>
                </div>
              </div>
            ))}
          </Space>
          <Button icon={<PlusOutlined />} style={{ marginTop: 8 }} onClick={addLevel}>
            Add Level
          </Button>
        </div>

        <Button
          type="primary"
          loading={updateDefinition.isPending || createDefinition.isPending}
          onClick={handleSave}
        >
          Save
        </Button>
      </Space>
    </Card>
  );
}

export function ApprovalWorkflowPage() {
  const entityType: WorkflowEntityType = 'DPR_HEADER';
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const { data: projects } = useProjects();
  const { data: definitions, isLoading } = useWorkflowDefinitions(entityType);

  const projectOptions = useMemo(
    () => [
      { value: '', label: 'Org-wide default' },
      ...(projects ?? []).map((p) => ({ value: p.id, label: `${p.tender_no} — ${p.name}` })),
    ],
    [projects],
  );

  return (
    <div>
      <Typography.Title level={3}>Approval Workflow</Typography.Title>
      <Typography.Paragraph type="secondary">
        Configure who can approve DPRs, how many approval levels are required, and whether
        approvals are required at all — org-wide by default, or overridden per project.
      </Typography.Paragraph>

      <Space style={{ marginBottom: 16 }}>
        <Typography.Text>Project:</Typography.Text>
        <Select
          style={{ width: 320 }}
          value={selectedProjectId ?? ''}
          onChange={(v) => setSelectedProjectId(v || null)}
          options={projectOptions}
          showSearch
          optionFilterProp="label"
        />
      </Space>

      {isLoading && <Skeleton active paragraph={{ rows: 6 }} />}
      {!isLoading && !definitions?.some((d) => d.is_org_default) && (
        <Alert
          type="warning"
          showIcon
          message="No org-wide default workflow found for this entity type. This shouldn't happen — contact support."
        />
      )}
      {!isLoading && definitions && definitions.some((d) => d.is_org_default) && (
        <WorkflowEditor
          key={`${entityType}:${selectedProjectId ?? 'org'}`}
          entityType={entityType}
          definitions={definitions}
          selectedProjectId={selectedProjectId}
        />
      )}
    </div>
  );
}
