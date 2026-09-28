import { Pressable, Text, TextInput, View } from 'react-native';
import type { Priority, Project, Section, Task, TaskOwner, TaskStatus } from '@/src/domain/models';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { Card, Muted } from './ui';
import { DateEntry } from './DateEntry';

const priorities: Priority[] = ['low', 'normal', 'high'];
const owners: TaskOwner[] = ['me', 'kellyn', 'shared', 'system'];
const statuses: TaskStatus[] = ['backlog', 'scheduled', 'overdue', 'deferred', 'complete', 'archived'];

export type TaskDraft = { title: string; description: string; sectionId: string; projectId: string; priority: Priority; dueDate: string; owner: TaskOwner; storyPoints: string; status: TaskStatus };
export const blankTaskDraft = (sectionId = ''): TaskDraft => ({ title: '', description: '', sectionId, projectId: '', priority: 'normal', dueDate: '', owner: 'me', storyPoints: '1', status: 'backlog' });
export const taskToDraft = (task: Task): TaskDraft => ({ title: task.title, description: task.description ?? '', sectionId: task.sectionId, projectId: task.projectId ?? '', priority: task.priority, dueDate: task.dueDate ?? '', owner: task.owner, storyPoints: String(task.storyPoints), status: task.status });

export function TaskForm({ draft, onChange, sections, projects, showStatus = false }: { draft: TaskDraft; onChange: (draft: TaskDraft) => void; sections: Section[]; projects: Project[]; showStatus?: boolean }) {
  const { colors } = useAppTheme();
  const inputStyle = { color: colors.text, backgroundColor: colors.background, borderRadius: 11, padding: 12, fontSize: 15 } as const;
  const select = (label: string, key: keyof TaskDraft, choices: { value: string; label: string }[]) => <View style={{ gap: 7 }} key={key}><Muted>{label}</Muted><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{choices.map(choice => <Pressable key={choice.value} onPress={() => onChange({ ...draft, [key]: choice.value })} style={{ backgroundColor: draft[key] === choice.value ? colors.soft : colors.background, borderRadius: 9, padding: 9 }}><Text style={{ color: colors.text, fontSize: 13 }}>{choice.label}</Text></Pressable>)}</View></View>;
  return <Card title="Task details">
    <TextInput value={draft.title} onChangeText={title => onChange({ ...draft, title })} placeholder="What needs doing?" placeholderTextColor={colors.muted} style={inputStyle} />
    <TextInput value={draft.description} onChangeText={description => onChange({ ...draft, description })} placeholder="Description (optional)" placeholderTextColor={colors.muted} multiline style={[inputStyle, { minHeight: 76, textAlignVertical: 'top' }]} />
    {select('Section · required', 'sectionId', sections.map(s => ({ value: s.id, label: s.name })))}
    {select('Project · optional', 'projectId', [{ value: '', label: 'None' }, ...projects.map(p => ({ value: p.id, label: p.name }))])}
    {select('Priority', 'priority', priorities.map(value => ({ value, label: value })))}
    {select('Owner', 'owner', owners.map(value => ({ value, label: value === 'kellyn' ? 'Kellyn' : value[0].toUpperCase() + value.slice(1) })))}
    <DateEntry value={draft.dueDate} onChange={dueDate => onChange({ ...draft, dueDate, status: draft.status === 'complete' || draft.status === 'archived' ? draft.status : !dueDate ? 'backlog' : draft.status === 'backlog' ? 'scheduled' : draft.status })} />
    <View style={{ gap: 7 }}><Muted>Story points · positive number</Muted><TextInput value={draft.storyPoints} onChangeText={storyPoints => onChange({ ...draft, storyPoints })} keyboardType="number-pad" style={inputStyle} /></View>
    {showStatus ? select('Status', 'status', statuses.map(value => ({ value, label: value }))) : null}
  </Card>;
}

export function FormError({ children }: { children: string }) { const { colors } = useAppTheme(); return <Text style={{ color: colors.danger, fontSize: 14 }}>{children}</Text>; }
