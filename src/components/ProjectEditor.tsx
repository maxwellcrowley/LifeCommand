import { planToken } from '../domain/planState';
import { reconcilePlans, transitionSummary } from '../domain/projectPlans';
import { ProjectScope, ProjectHeader } from './ProjectAppearance';
import { Action } from './Action';
import { AppTextInput as TextInput } from '@/src/components/AppText';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { DeleteConfirmation } from './DeleteConfirmation';
import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Switch, View } from 'react-native';
import { useAppData } from '@/src/data/useAppData';
import type { Project } from '@/src/domain/models';
import { changeProject, projectStatuses, projectStatusLabels } from '@/src/domain/projects';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { FormError } from './TaskForm';
import { ProjectPlanView } from './ProjectPlanView';
import { Card, Label, Muted, Page, Row } from './ui';

const toDraft = (project?: Project) => ({ name: project?.name ?? '', description: project?.description ?? '', notes: project?.notes ?? '', sectionId: project?.sectionId ?? '', status: project?.status ?? 'active', trackCompletion: project?.trackCompletion ?? true, useWeightedProgress: project?.useWeightedProgress ?? false, defaultTaskPoints: String(project?.defaultTaskPoints ?? 1), includeBacklogTasks: project?.includeBacklogTasks ?? true });

export function ProjectEditor({ project, initialView }: { project?: Project; initialView?: string }) {
  const { data, addProject, editProject, deleteProject } = useAppData();
  const { colors } = useAppTheme();
  const [snapshot, setSnapshot] = useState(project);
  const [draft, setDraft] = useState(() => toDraft(project));
  const [lifecyclePreview, setLifecyclePreview] = useState<{ token: string; status: Project['status']; summary: string }>();
  const [details, setDetails] = useState(initialView !== 'plan');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const unsaved = useUnsavedChanges(JSON.stringify(draft) !== JSON.stringify(toDraft(snapshot)));
  const busy = useRef(false);
  const stale = snapshot?.updatedAt !== project?.updatedAt;
  const leave = () => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/projects'); };
  const save = async (status = draft.status, confirmPlan = false) => {
    if (busy.current || stale) return;
    busy.current = true; setSaving(true); setError('');
    try {
      const input = { ...draft, status, defaultTaskPoints: Number(draft.defaultTaskPoints) };
      if (snapshot?.plan && data && status !== snapshot.status && !confirmPlan) {
        const next = reconcilePlans(data, changeProject(data, snapshot.id, input, snapshot.updatedAt));
        setLifecyclePreview({ token: planToken(data, project!), status, summary: transitionSummary(data, next) }); return;
      }
      if (snapshot) await editProject(snapshot.id, input, snapshot.updatedAt, confirmPlan ? lifecyclePreview?.token : undefined);
      else await addProject(input);
      unsaved.allowLeave(); leave();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save project.'); }
    finally { busy.current = false; setSaving(false); }
  };
  const field = (key: 'name' | 'description' | 'notes' | 'defaultTaskPoints', label: string) => <View style={{ gap: 6 }}>
    <Muted>{label}</Muted><TextInput accessibilityLabel={label} editable={!saving} value={draft[key]} onChangeText={value => { setLifecyclePreview(undefined); setDraft(current => ({ ...current, [key]: value })); }} multiline={key === 'description' || key === 'notes'} keyboardType={key === 'defaultTaskPoints' ? 'decimal-pad' : 'default'} style={{ minHeight: key === 'notes' ? 100 : key === 'description' ? 76 : 44, padding: 12, borderRadius: 10, fontSize: 15, color: colors.text, backgroundColor: colors.background, textAlignVertical: 'top' }} />
  </View>;
  const choices = (key: 'sectionId' | 'status', label: string, options: { value: string; label: string }[]) => <View style={{ gap: 6 }}><Muted>{label}</Muted><View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{options.map(option => <Pressable key={option.value} disabled={saving} accessibilityRole="radio" accessibilityLabel={`${label}: ${option.label}`} aria-checked={draft[key] === option.value} accessibilityState={{ checked: draft[key] === option.value }} onPress={() => { setLifecyclePreview(undefined); setDraft(current => ({ ...current, [key]: option.value })); }} style={{ minHeight: 44, maxWidth: '100%', padding: 10, justifyContent: 'center', borderRadius: 10, backgroundColor: draft[key] === option.value ? colors.soft : colors.background }}><Label>{option.label}</Label></Pressable>)}</View></View>;
  const toggle = (key: 'trackCompletion' | 'useWeightedProgress' | 'includeBacklogTasks', label: string) => <Row><Label>{label}</Label><Switch accessibilityLabel={label} disabled={saving} value={draft[key]} onValueChange={value => { setLifecyclePreview(undefined); setDraft(current => ({ ...current, [key]: value })); }} /></Row>;
  if (!data) return <Page hasHeader title="Project" subtitle="Loading your projects…" />;
  return <ProjectScope project={{ sectionId: draft.sectionId }} sections={data.sections}><Page hasHeader title={project ? initialView === 'plan' ? project.name : 'Edit project' : 'New project'} subtitle={initialView === 'plan' ? 'One phase at a time, with the whole plan in view.' : 'Organize related tasks and choose how to track progress.'}>
    {initialView !== 'plan' ? <ProjectHeader title={draft.name || 'New project'} /> : null}
    {project ? <ProjectPlanView project={project} initialView={initialView} /> : null}
    {unsaved.prompt}
    {project ? <Action label="Project details and lifecycle" expanded={details} onPress={() => setDetails(!details)} /> : null}
    {details || !project ? <>
    <Card title="Project details">
      {field('notes', 'Project notes (optional)')}
      {field('name', 'Project name · required')}{field('description', 'Project description · optional')}
      {choices('sectionId', 'Project section', [{ value: '', label: 'None' }, ...data.sections.filter(s => !s.archived || s.id === draft.sectionId).map(section => ({ value: section.id, label: section.name }))])}
      {choices('status', 'Project status', projectStatuses.map(value => ({ value, label: projectStatusLabels[value] })))}
      <Muted>Project status does not change task status. Archived projects keep their tasks and can be restored.</Muted>
    </Card>
    <Card title="Progress settings">
      {toggle('trackCompletion', 'Track completion')}{toggle('useWeightedProgress', 'Use weighted progress')}
      <Muted>Simple progress counts tasks equally. Weighted progress uses their story points.</Muted>
      {field('defaultTaskPoints', 'Default task points · positive number')}
      <Muted>Suggested points for new tasks. Existing task points stay as entered.</Muted>
      {toggle('includeBacklogTasks', 'Include backlog tasks')}
      <Muted>When off, undated incomplete tasks are excluded. Completed tasks still count.</Muted>
    </Card>
    {stale ? <Card title="This project changed"><Muted>Reload the saved details before continuing.</Muted><EditorButton label="Reload project" disabled={saving} onPress={() => { setSnapshot(project); setLifecyclePreview(undefined); setDraft(toDraft(project)); setError(''); }} /></Card> : null}
    {error ? <FormError>{error}</FormError> : null}
    <EditorButton label={saving ? 'Saving…' : 'Save project'} onPress={() => void save()} disabled={saving || stale} />
    {lifecyclePreview ? <Card title="Review project lifecycle change"><Muted>Save project as {projectStatusLabels[lifecyclePreview.status]}. Task records and dates are retained. Resuming a plan evaluates its explicit automatic rules; finishing uses all plan requirements.</Muted><Label>{lifecyclePreview.summary || 'No phase transition.'}</Label><Action primary label="Confirm project lifecycle change" disabled={saving || stale} onPress={() => void save(lifecyclePreview.status, true)} /><Action label="Cancel project lifecycle preview" onPress={() => setLifecyclePreview(undefined)} /></Card> : null}
    {project ? <Card><Muted>Archive and restore also save the details above. Restoring makes the project Active.</Muted><EditorButton label={project.status === 'archived' ? 'Unarchive project' : 'Archive project'} onPress={() => void save(project.status === 'archived' ? 'active' : 'archived')} disabled={saving || stale} /></Card> : null}
    {snapshot ? <DeleteConfirmation kind="project" name={snapshot.name} disabled={saving || stale} onDelete={() => deleteProject(snapshot.id, snapshot.updatedAt)} onDeleted={() => { unsaved.allowLeave(); leave(); }} /> : null}
    <EditorButton label="Cancel" onPress={leave} disabled={saving} />
    </> : null}
  </Page></ProjectScope>;
}

function EditorButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return <Action label={label} onPress={onPress} disabled={disabled} primary={label === 'Save project'} />;
}
