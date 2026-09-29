import { View } from 'react-native';
import type { Project, Task } from '@/src/domain/models';
import { getProjectProgress } from '@/src/domain/projects';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { Label, Muted, Row } from './ui';

export function ProjectProgress({ project, tasks }: { project: Project; tasks: Task[] }) {
  const { colors } = useAppTheme();
  const progress = getProjectProgress(tasks, project);
  const linked = tasks.filter(task => task.projectId === project.id && task.status !== 'archived');
  return <>
    {!linked.length ? <Muted>No tasks linked to this project yet. Choose this project in Capture or a task editor once it is Active. Archived tasks are hidden.</Muted> : null}
    {linked.length > 0 && progress.total === 0 ? <Muted>No tasks count toward progress yet. Schedule a linked task or turn on Include backlog tasks.</Muted> : null}
    {progress.value === null ? <Muted>Completion tracking is off.</Muted> : <>
      <Row><Label>{project.useWeightedProgress ? 'Weighted progress' : 'Simple progress'}</Label><Label>{progress.value}%</Label></Row>
      <View accessibilityRole="progressbar" accessibilityLabel={`${project.name} progress`} accessibilityValue={{ min: 0, max: 100, now: progress.value }} style={{ backgroundColor: colors.background, borderRadius: 6, height: 8, overflow: 'hidden' }}>
        <View style={{ backgroundColor: colors.accent, width: `${progress.value}%`, height: 8 }} />
      </View>
      <Muted>{progress.complete} of {progress.total} tasks · {progress.donePoints}/{progress.totalPoints} story points</Muted>
    </>}
  </>;
}
