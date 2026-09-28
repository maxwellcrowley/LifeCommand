import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Card, Label, Muted, Page, Row } from '@/src/components/ui';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { getBacklogBySection } from '@/src/domain/tasks';
import { localDateKey } from '@/src/domain/dates';
export default function ReviewScreen() {
  const { data } = useAppData();
  const { colors } = useAppTheme();
  if (!data) return <Page title="Review" subtitle="Loading sections…" />;
  const groups = getBacklogBySection(data);
  const futureGroups = data.sections.map(section => ({ section, tasks: data.tasks.filter(task => task.sectionId === section.id && !!task.dueDate && task.dueDate > localDateKey(new Date()) && task.status !== 'complete' && task.status !== 'archived') })).sort((a, b) => a.section.order - b.section.order);
  return <Page title="Review" subtitle="Section backlogs keep undated work organized."><Card title="Section backlogs"><Muted>Backlog tasks stay off Today until they have a due date.</Muted>{groups.map(({ section, tasks }) => <View key={section.id} style={{ gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}><Row><Label style={{ color: section.color }}>{section.name}</Label><Muted>{tasks.length}</Muted></Row>{tasks.length ? tasks.map(task => <Link key={task.id} href={{ pathname: '/task/[id]', params: { id: task.id } }} asChild><Pressable style={{ backgroundColor: colors.background, borderRadius: 10, padding: 11 }}><Label>{task.title}</Label><Muted>{task.priority} · {task.storyPoints} point{task.storyPoints === 1 ? '' : 's'}{task.projectId ? ` · ${data.projects.find(project => project.id === task.projectId)?.name ?? ''}` : ''}</Muted></Pressable></Link>) : <Muted>No backlog tasks.</Muted>}</View>)}</Card><Card title="Scheduled later">{futureGroups.map(({ section, tasks }) => <View key={section.id} style={{ gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}><Row><Label style={{ color: section.color }}>{section.name}</Label><Muted>{tasks.length}</Muted></Row>{tasks.map(task => <Link key={task.id} href={{ pathname: '/task/[id]', params: { id: task.id } }} asChild><Pressable style={{ backgroundColor: colors.background, borderRadius: 10, padding: 11 }}><Row><Label>{task.title}</Label><Muted>{task.dueDate}</Muted></Row></Pressable></Link>)}</View>)}{futureGroups.every(group => group.tasks.length === 0) ? <Muted>No future scheduled tasks.</Muted> : null}</Card></Page>;
}
