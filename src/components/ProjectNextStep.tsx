import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { Project } from '../domain/models';
import { getProjectNextTask } from '../domain/projects';
import { useAppData } from '../data/useAppData';
import { useDevicePreferences } from '../data/DevicePreferences';
import { AppTextInput } from './AppText';
import { Action, QuickSchedule } from './TaskScheduling';
import { Label, Muted, Row } from './ui';
import { FormError } from './TaskForm';
import { useAppTheme } from '../theme/ThemeProvider';

export function ProjectNextStep({ project, today }: { project: Project; today: string }) {
  const { data, editTask } = useAppData(), { preferences, save } = useDevicePreferences(), { colors } = useAppTheme();
  const [choose, setChoose] = useState(false), [query, setQuery] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const pending = useRef(false);
  if (!data || project.status === 'archived') return null;
  const next = getProjectNextTask(data.tasks, project, today, preferences.projectNextTaskIds[project.id]);
  const completed = data.tasks.filter(t => t.projectId === project.id && t.status === 'complete').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '') || a.id.localeCompare(b.id));
  const task = next.task ?? completed[0];
  const run = async (operation: () => Promise<void>) => { if (pending.current) return; pending.current = true; setBusy(true); setError(''); try { await operation(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Retry.'); } finally { pending.current = false; setBusy(false); } };
  return <View style={{ gap: 8 }}><Label>{next.choices.length} remaining tasks</Label>
    {next.task ? <><Label>{next.kind === 'upcoming' ? 'Upcoming' : next.kind === 'selected' ? 'Selected next task' : next.kind === 'due' ? 'Next due task' : 'Next backlog task'}</Label><Muted>{task!.title}{task!.dueDate ? ` · ${task!.dueDate}` : ''}</Muted></> : <Muted>{completed.length ? 'All tasks completed. Reopen the most recently completed task below, or add another.' : 'No tasks yet. Add the first next step.'}</Muted>}
    {task ? <Row>{task.status !== 'complete' ? <QuickSchedule task={task} /> : null}<Action label={`${task.status === 'complete' ? 'Reopen' : 'Complete'} next task: ${task.title}`} text={task.status === 'complete' ? 'Reopen' : 'Complete'} disabled={busy} onPress={() => void run(() => editTask(task.id, { status: task.status === 'complete' ? task.dueDate ? 'scheduled' : 'backlog' : 'complete' }, undefined, task.updatedAt))} /><Action label={`Edit next task: ${task.title}`} text="Edit task" onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })} /></Row> : null}
    {project.status === 'active' ? <Action primary label={`Add task to ${project.name}`} text="Add task" onPress={() => router.push({ pathname: '/(tabs)/capture', params: { projectId: project.id, sectionId: project.sectionId } })} /> : null}
    {next.choices.length ? <><Action label={`Choose next task for ${project.name}`} text="Choose next task" expanded={choose} onPress={() => setChoose(!choose)} />{choose ? <><Muted>This account’s choice stays on this device. Dates and priorities do not change. Ineligible choices fall back to automatic selection.</Muted><Action label={`Use automatic next task for ${project.name}`} text="Automatic" disabled={busy} onPress={() => void run(() => save({ projectNextTaskIds: { ...preferences.projectNextTaskIds, [project.id]: '' } }))} /><AppTextInput accessibilityLabel={`Find next task for ${project.name}`} value={query} onChangeText={setQuery} style={{ minHeight: 44, padding: 10, color: colors.text, borderColor: colors.border, borderWidth: 1 }} />{next.choices.filter(t => t.title.toLowerCase().includes(query.toLowerCase())).map(t => <Action key={t.id} label={`Choose ${t.title} as next task for ${project.name}`} text={`${preferences.projectNextTaskIds[project.id] === t.id ? '✓ ' : ''}${t.title}`} disabled={busy} onPress={() => void run(() => save({ projectNextTaskIds: { ...preferences.projectNextTaskIds, [project.id]: t.id } }))} />)}</> : null}</> : null}
    {error ? <FormError>{error}</FormError> : null}
  </View>;
}
