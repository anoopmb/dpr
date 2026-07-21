import type { WorkflowDefinitionRead } from '@/api/hooks/useWorkflowConfig';

// DRAFT/SUBMITTED/REJECTED/LOCKED/APPROVED are fixed bookends with fixed
// colors; everything else is an admin-configured approval level — colored
// by cycling a palette keyed on the level's position in its workflow.
const FIXED_STATUS_COLOR: Record<string, string> = {
  DRAFT: 'blue',
  SUBMITTED: 'gold',
  APPROVED: 'green',
  REJECTED: 'red',
  LOCKED: 'green',
};
const LEVEL_COLOR_PALETTE = ['gold', 'cyan', 'purple', 'geekblue', 'volcano', 'lime'];

export function statusColor(status: string, workflow: WorkflowDefinitionRead | undefined): string {
  if (FIXED_STATUS_COLOR[status]) return FIXED_STATUS_COLOR[status];
  const idx = workflow?.levels.findIndex((l) => l.status_code === status) ?? -1;
  return idx >= 0 ? LEVEL_COLOR_PALETTE[idx % LEVEL_COLOR_PALETTE.length] : 'default';
}

export function statusLabel(status: string, workflow: WorkflowDefinitionRead | undefined): string {
  const level = workflow?.levels.find((l) => l.status_code === status);
  return level ? level.label : status.replace(/_/g, ' ');
}
