import { RepeatEditor } from './RepeatEditor';
import type { RepeatDraft } from '../domain/recurrenceDraft';
import { useState } from 'react';
import { AppText as Text, AppTextInput as TextInput } from '@/src/components/AppText';
import { Pressable, View } from 'react-native';
import type { Priority, Project, Section, Task, TaskOwner, TaskStatus } from '@/src/domain/models';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { Card, Muted } from './ui';
import { DateEntry } from './DateEntry';
import { getActiveProjects, projectStatusLabels } from '@/src/domain/projects';

import { ReminderEditor } from './ReminderEditor';
import { reminderToDraft, type ReminderDraft } from '@/src/domain/reminders';

const priorities: Priority[] = ['low', 'normal', 'high'];
const owners: TaskOwner[] = ['me', 'kellyn', 'shared', 'system'];
const statuses: TaskStatus[] = ['backlog', 'scheduled', 'overdue', 'deferred', 'complete', 'archived'];

export type TaskDraft = ReminderDraft & { repeat?: RepeatDraft; title: string; description: string; notes: string; sectionId: string; projectId: string; priority: Priority; dueDate: string; owner: TaskOwner; storyPoints: string; status: TaskStatus };
export const blankTaskDraft = (sectionId = ''): TaskDraft => ({ ...reminderToDraft({}), title: '', description: '', notes: '', sectionId, projectId: '', priority: 'normal', dueDate: '', owner: 'me', storyPoints: '1', status: 'backlog' });
export const taskToDraft = (task: Task): TaskDraft => ({ ...reminderToDraft(task), title: task.title, description: task.description ?? '', notes: task.notes ?? '', sectionId: task.sectionId, projectId: task.projectId ?? '', priority: task.priority, dueDate: task.dueDate ?? '', owner: task.owner, storyPoints: String(task.storyPoints), status: task.status });

export function TaskForm({ draft, onChange, sections, projects, showStatus = false, currentProjectId, occurrence = false }: { draft: TaskDraft; onChange: (draft: TaskDraft) => void; sections: Section[]; projects: Project[]; showStatus?: boolean; currentProjectId?: string; occurrence?: boolean }) {
  const { colors } = useAppTheme();
  const [advanced, setAdvanced] = useState(showStatus);
  const activeProjects = getActiveProjects(projects);
  const currentProject = projects.find(project => project.id === currentProjectId && project.status !== 'active');
  const projectChoices = [...activeProjects.map(project => ({ value: project.id, label: project.name })), ...(currentProject ? [{ value: currentProject.id, label: `${currentProject.name} (${projectStatusLabels[currentProject.status]} · current link)` }] : [])];
  const inputStyle = { color: colors.text, backgroundColor: colors.background, borderRadius: 11, minHeight: 44, padding: 12, fontSize: 15 } as const;
  const select = (label: string, key: keyof TaskDraft, choices: { value: string; label: string }[]) => <View style={{ gap: 7 }} key={key}><Muted>{label}</Muted><View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{choices.map(choice => <Pressable accessibilityRole="radio" accessibilityLabel={`${label}: ${choice.label}`} aria-checked={draft[key] === choice.value} accessibilityState={{ checked: draft[key] === choice.value }} key={choice.value} onPress={() => onChange({ ...draft, [key]: choice.value })} style={{ backgroundColor: draft[key] === choice.value ? colors.soft : colors.background, maxWidth: '100%', borderRadius: 9, minHeight: 44, justifyContent: 'center', padding: 9 }}><Text style={{ color: colors.text, fontSize: 13 }}>{choice.label}</Text></Pressable>)}</View></View>;
  return <Card title="Task details">
    <TextInput accessibilityLabel="Task title, required" value={draft.title} onChangeText={title => onChange({ ...draft, title })} placeholder="What needs doing?" placeholderTextColor={colors.muted} style={inputStyle} />
    {select('Section · required', 'sectionId', sections.filter(s => !s.archived || s.id === draft.sectionId).sort((a, b) => a.order - b.order).map(s => ({ value: s.id, label: s.name + (s.archived ? " (archived)" : "") })))}
    {(!draft.repeat || occurrence) ? <DateEntry value={draft.dueDate} onChange={dueDate => onChange({ ...draft, dueDate, status: draft.status === 'complete' || draft.status === 'archived' ? draft.status : !dueDate ? 'backlog' : draft.status === 'backlog' ? 'scheduled' : draft.status })} /> : null}
    <RepeatEditor value={draft.repeat} date={draft.dueDate} occurrence={occurrence} onChange={repeat => onChange({ ...draft, repeat })} />
    <Pressable accessibilityRole="button" accessibilityLabel="Optional task details" accessibilityState={{ expanded: advanced }} aria-expanded={advanced} onPress={() => setAdvanced(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}><Muted>{advanced ? '⌄' : '›'} Optional details</Muted></Pressable>
    {advanced ? <>
    <TextInput accessibilityLabel="Task description, optional" value={draft.description} onChangeText={description => onChange({ ...draft, description })} placeholder="Description (optional)" placeholderTextColor={colors.muted} multiline style={[inputStyle, { minHeight: 76, textAlignVertical: 'top' }]} />
    <View style={{ gap: 7 }}><Muted>Notes · optional private detail; not shown on Today</Muted><TextInput accessibilityLabel="Task notes, optional" value={draft.notes} onChangeText={notes => onChange({ ...draft, notes })} placeholder="Notes (optional)" placeholderTextColor={colors.muted} multiline autoCorrect style={[inputStyle, { minHeight: 100, textAlignVertical: 'top' }]} /></View>
    {select('Project · optional', 'projectId', [{ value: '', label: 'None' }, ...projectChoices])}
    {!activeProjects.length ? <Muted>No active projects available. Create or activate one in Projects, or choose None.</Muted> : null}
    {currentProject ? <Muted>This task keeps its {projectStatusLabels[currentProject.status].toLowerCase()} project link. Choose None to unlink it, or choose an active project to move it.</Muted> : null}
    {draft.projectId && !projectChoices.some(project => project.value === draft.projectId) ? <FormError>This project is no longer active. Choose an active project or None.</FormError> : null}
    {select('Priority', 'priority', priorities.map(value => ({ value, label: value })))}
    {select('Owner', 'owner', owners.map(value => ({ value, label: value === 'kellyn' ? 'Kellyn' : value[0].toUpperCase() + value.slice(1) })))}

    <View style={{ gap: 7 }}><Muted>Story points · positive number</Muted><TextInput accessibilityLabel="Story points, positive number" value={draft.storyPoints} onChangeText={storyPoints => onChange({ ...draft, storyPoints })} keyboardType="number-pad" style={inputStyle} /></View>
    <ReminderEditor draft={draft} onChange={reminder => onChange({ ...draft, ...reminder })} />
    {showStatus ? select('Status', 'status', statuses.map(value => ({ value, label: value }))) : null}
    </> : null}
  </Card>;
}

export function FormError({ children }: { children: string }) { const { colors } = useAppTheme(); return <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 14 }}>{children}</Text>; }
