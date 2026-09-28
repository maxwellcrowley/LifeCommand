import { View } from 'react-native';
import { Card, Label, Muted, Page, Row } from '@/src/components/ui';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { calculateProjectProgress } from '@/src/domain/tasks';
export default function ProjectsScreen() {
  const { data } = useAppData();
  const { colors } = useAppTheme();
  return <Page title="Projects" subtitle="Progress across the work that matters.">{data?.projects.map(project => { const progress = calculateProjectProgress(data.tasks, project.id, project.includeBacklogTasks); const value = project.useWeightedProgress ? progress.weighted : progress.simple; return <Card key={project.id} title={project.name}><Muted>{project.description}</Muted>{project.trackCompletion ? <><Row><Label>{project.useWeightedProgress ? 'Weighted progress' : 'Simple progress'}</Label><Label>{value}%</Label></Row><View style={{ backgroundColor: colors.background, borderRadius: 6, height: 8, overflow: 'hidden' }}><View style={{ backgroundColor: colors.accent, width: `${value}%`, height: 8 }} /></View><Muted>{progress.complete} of {progress.total} tasks · {progress.donePoints}/{progress.totalPoints} story points</Muted></> : <Muted>Completion tracking is off.</Muted>}</Card>; })}</Page>;
}
