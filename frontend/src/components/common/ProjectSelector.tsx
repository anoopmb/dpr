import { useEffect } from 'react';
import { Select } from 'antd';
import { useProjects } from '@/api/hooks/useProjects';
import { useProjectContextStore } from '@/store/project-context-store';

export function ProjectSelector({ style }: { style?: React.CSSProperties }) {
  const { data: projects, isLoading } = useProjects();
  const selectedProjectId = useProjectContextStore((s) => s.selectedProjectId);
  const setSelectedProjectId = useProjectContextStore((s) => s.setSelectedProjectId);

  useEffect(() => {
    if (!isLoading && projects && selectedProjectId) {
      const exists = projects.some((p) => p.id === selectedProjectId);
      if (!exists) setSelectedProjectId(null);
    }
  }, [isLoading, projects, selectedProjectId, setSelectedProjectId]);

  const options = (projects ?? []).map((p) => ({ value: p.id, label: `${p.tender_no} — ${p.name}` }));

  return (
    <Select
      placeholder="Select project"
      style={{ width: 280, ...style }}
      loading={isLoading}
      value={selectedProjectId ?? undefined}
      onChange={(value) => setSelectedProjectId(value)}
      options={options}
      showSearch
      optionFilterProp="label"
    />
  );
}
