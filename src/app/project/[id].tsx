import { Link, useLocalSearchParams } from 'expo-router';
import { ProjectEditor } from '@/src/components/ProjectEditor';
import { Muted, Page } from '@/src/components/ui';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';

export default function EditProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, resetVersion } = useAppData();
  const { colors } = useAppTheme();
  if (!data) return <Page hasHeader title="Project" subtitle="Loading your projects…" />;
  const project = data.projects.find(item => item.id === id);
  if (!project) return <Page hasHeader title="Project not found"><Muted>This project is no longer available.</Muted><Link href="/(tabs)/projects" style={{ color: colors.accent, paddingVertical: 12 }}>Back to Projects</Link></Page>;
  return <ProjectEditor key={`${project.id}:${resetVersion}`} project={project} />;
}
