import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { AppData, Project } from '../domain/models';
import { currentPhase, milestoneState, nextMilestone, phaseAdditionBlocker, phaseReadiness, planNotices, projectBlockers } from '../domain/planState';
import { useAppData } from '../data/useAppData';
import { useDevicePreferences } from '../data/DevicePreferences';
import { useAppTheme } from '../theme/ThemeProvider';
import { ProjectHeader, useProjectAppearance } from './ProjectAppearance';
import { ProjectProgress } from './ProjectProgress';
import { ProjectTasks } from './ProjectTasks';
import { TaskRow } from './TaskList';
import { PhaseDrag } from './PhaseDrag';
import { Action } from './Action';
import { Card, Label, Muted, Row } from './ui';
import { PlanEditorDialog, type PlanEditorRequest } from './PlanEditorDialog';
import { localDateKey } from '../domain/dates';
import { FormError } from './TaskForm';

export function ProjectPlanSummary({ project, data, showAction = true }: { project: Project; data: AppData; showAction?: boolean }) {
  const phase = currentPhase(project), milestone = nextMilestone(data.tasks, project);
  if (!project.plan) return null;
  return <View style={{ gap: 5 }}>
    <Label>{!project.plan.enabled ? 'Plan disabled' : !project.plan.started ? 'Draft plan' : phase ? `${phase.name} · Phase ${project.plan.phases.indexOf(phase) + 1} of ${project.plan.phases.length}` : 'All phases complete'}</Label>
    {milestone ? <Muted>◇ Next milestone: {milestone.title}{milestone.phaseId !== phase?.id ? ` (${project.plan.phases.find(p => p.id === milestone.phaseId)?.name})` : ''} · {milestoneState(data.tasks, milestone).label}</Muted> : null}
    {phase ? (() => { const count = data.tasks.filter(t => t.projectId === project.id && t.phaseId !== phase.id && t.status !== 'complete' && t.status !== 'archived' && t.dueDate && t.dueDate < localDateKey(new Date())).length; return count ? <Muted>{count} overdue outside the current phase · review in Tasks</Muted> : null; })() : null}
    {showAction ? <Action label={`Open plan: ${project.name}`} text="Open plan" onPress={() => router.push({ pathname: '/project/[id]', params: { id: project.id, view: 'plan' } })} /> : null}
  </View>;
}

export function ProjectPlanView({ project, initialView, onReopenProject }: { project: Project; initialView?: string; onReopenProject: () => void }) {
  const { data } = useAppData(), { preferences, save } = useDevicePreferences(), { colors } = useAppTheme(), appearance = useProjectAppearance();
  const [editor, setEditor] = useState<{ request: PlanEditorRequest; data: AppData; project: Project }>();
  const [error, setError] = useState('');
  const focusRef = useRef<View>(null), returnFocusRef = useRef<View | null>(null);
  const phaseHeaders = useRef(new Map<string, View>());
  const viewKey = `Plan:view:${project.id}`;
  const [view, setView] = useState(initialView ?? (preferences.collapsed[viewKey] ? 'plan' : 'tasks'));
  if (!data) return null;
  const open = (request: PlanEditorRequest) => {
    returnFocusRef.current = request.command?.type === 'reorder' ? phaseHeaders.current.get(request.command.phaseId) ?? focusRef.current : focusRef.current;
    setEditor({ request, data, project });
  };
  const pref = (key: string, value: boolean) => void save({ collapsed: { [key]: value } }).catch(e => setError(String(e)));
  const plan = project.plan;
  const addPhaseBlocker = phaseAdditionBlocker(project);
  const reopenPhase = plan?.started ? [...plan.phases].reverse().find(p => p.state === 'complete') : undefined;
  const command = (title: string, action: NonNullable<PlanEditorRequest['command']>) => open({ kind: 'command', command: action, title });
  const addTask = (phaseId?: string) => router.push({ pathname: '/(tabs)/capture', params: { project: project.id, phase: phaseId ?? '', section: project.sectionId ?? '', selection: `${project.updatedAt}:${data.tasks.length}` } });
  const changeView = (value: string) => { setView(value); pref(viewKey, value === 'plan'); };
  const notices = planNotices(data, project);
  return <View ref={focusRef} tabIndex={-1} style={{ gap: 14, width: '100%', maxWidth: 1000 }}>
    {plan ? <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8 }}>{['tasks', 'plan'].map(value => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={`Project ${value} view`} accessibilityState={{ selected: view === value }} onPress={() => changeView(value)} style={{ minHeight: 44, padding: 12, borderRadius: 10, backgroundColor: view === value ? appearance?.secondaryBackground ?? colors.soft : colors.background }}><Label>{value === 'tasks' ? 'Tasks' : 'Plan'}</Label></Pressable>)}</View> : addPhaseBlocker ? <View style={{ gap: 6 }}><Muted>{addPhaseBlocker} Review and confirm reopening to make the project Active; saved tasks are kept.</Muted><Action label="Reopen project to create a plan" text="Review reopening project" onPress={onReopenProject} /></View> : <Action label="Add project plan" onPress={() => open({ kind: 'create' })} />}
    {error ? <FormError>{error}</FormError> : null}
    {view === 'tasks' || !plan ? <ProjectTasks project={project} /> : <>
      <Muted>{!plan.started ? 'Draft plan' : currentPhase(project) ? `${currentPhase(project)!.name} · Phase ${plan.phases.findIndex(p => p.state === 'current') + 1} of ${plan.phases.length}` : 'All phases complete'} · {plan.automaticCompletion ? 'Automatic final completion enabled' : 'Final completion by confirmation'}</Muted>
      <Row>{!addPhaseBlocker ? <Action label="Add phase" onPress={() => open({ kind: 'phase' })} /> : null}<Action label="Edit plan" onPress={() => open({ kind: 'settings' })} /><Action label="Assign or move project tasks" text="Assign tasks" onPress={() => open({ kind: 'assign' })} /></Row>
      {addPhaseBlocker ? <View style={{ gap: 6 }}><Muted>{addPhaseBlocker} {reopenPhase ? 'Reopen a completed phase to resume the project; saved work and history are kept.' : 'Set the project to Active in Project details.'}</Muted>{reopenPhase ? <Action label="Reopen project to add phases" text={`Reopen ${reopenPhase.name}`} onPress={() => command('Reopen phase', { type: 'reopen', phaseId: reopenPhase.id })} /> : null}</View> : null}
      {!plan.enabled ? <Muted>Plan disabled. Its structure and history are kept. Enable it in Edit plan to resume gates.</Muted> : !plan.started ? <><Muted>Draft plan · assign tasks and add milestones below, then review and start. Saving a draft does not start or complete the project.</Muted><Action primary label="Review and start plan" onPress={() => command('Start project plan', { type: 'start' })} /></> : null}
      {project.status === 'paused' ? <Muted>Project paused. Resume it in Project details before advancing; task work remains available.</Muted> : null}
      {notices.some(n => n.includes('unfinished requirements')) ? <View style={{ gap: 6 }}>{notices.filter(n => n.includes('unfinished requirements')).map(notice => <Muted key={notice}>{notice}</Muted>)}</View> : null}
      {plan.phases.map((phase, index) => {
        const gate = phaseReadiness(data, project, phase), milestone = gate.milestones.find(m => !milestoneState(data.tasks, m).complete);
        const key = `Plan:phase:${project.id}:${phase.id}`, expanded = !(preferences.collapsed[key] ?? phase.state !== 'current');
        const tasks = data.tasks.filter(t => t.projectId === project.id && t.phaseId === phase.id);
        return <PhaseDrag key={phase.id} id={phase.id} enabled={phase.state === 'upcoming'} onMove={(from, to) => { const ids = plan.phases.map(p => p.id), source = ids.indexOf(from), target = ids.indexOf(to); if (source < 0 || target < 0) return; ids.splice(source, 1); ids.splice(target, 0, from); command('Reorder phases', { type: 'order', phaseIds: ids }); }}><View testID={`plan-phase-${phase.id}`} style={{ borderLeftWidth: phase.state === 'current' ? 3 : 1, borderLeftColor: phase.state === 'current' ? appearance?.secondaryBorder ?? colors.accent : colors.border, paddingLeft: 12, gap: 8, paddingVertical: 8 }}>
          <ProjectHeader focusRef={node => { if (node) phaseHeaders.current.set(phase.id, node); else phaseHeaders.current.delete(phase.id); }} title={`${index + 1}. ${phase.name}`} summary={gate.label} expanded={expanded} label={`Phase ${phase.name}, position ${index + 1} of ${plan.phases.length}, ${gate.label}`} onPress={() => pref(key, expanded)} />
          <Muted>{gate.total ? `${gate.done} of ${gate.total} required tasks complete` : 'No required tasks'}{phase.targetDate ? ` · Target ${phase.targetDate}` : ''}</Muted>
          <Muted>{milestone ? `◇ ${milestone.title} · ${milestoneState(data.tasks, milestone).label}` : gate.ready ? gate.empty ? 'No required work; explicit advancement only' : 'Required work complete' : `${gate.blockers.length} unfinished requirements`}</Muted>
          {expanded ? <>
            {phase.description ? <Muted>{phase.description}</Muted> : null}
            <Muted>{phase.rule.mode === 'manual' ? 'Manual advancement' : phase.rule.mode === 'required' ? 'Advances automatically when required work is complete' : `Advances after ${gate.milestones.find(m => m.id === phase.rule.milestoneId)?.title ?? 'missing milestone — repair rule'} and all required work`}</Muted>
            {tasks.map(task => <TaskRow grouped showPhaseContext={false} key={task.id} task={task} data={data} />)}
            {!tasks.length ? <Muted>No assigned tasks yet.</Muted> : null}
            {gate.milestones.map(m => { const state = milestoneState(data.tasks, m); return <View key={m.id} style={{ gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
              <Label>◇ {m.title} · {state.label}</Label><Muted>{m.required ? 'Required' : 'Optional'} · {state.done} of {state.total} linked tasks complete{m.targetDate ? ` · Target ${m.targetDate}` : ''}</Muted>{m.description ? <Muted>{m.description}</Muted> : null}
              {state.invalid.length ? <FormError>Repair invalid task links in Edit milestone. Missing, moved, archived or recurring tasks cannot satisfy this milestone.</FormError> : null}
              <Row>{m.type === 'approval' ? <Action label={`${m.approvedAt ? 'Reopen' : 'Approve'} milestone: ${m.title}`} text={m.approvedAt ? 'Reopen approval' : 'Approve'} disabled={!m.approvedAt && !state.ready} onPress={() => command(m.approvedAt ? 'Reopen approval' : 'Approve milestone', { type: m.approvedAt ? 'revoke' : 'approve', milestoneId: m.id })} /> : null}<Action label={`Edit milestone: ${m.title}`} text="Edit milestone" onPress={() => open({ kind: 'milestone', phase, milestone: m })} /><Action label={`Delete milestone: ${m.title}`} text="Delete" onPress={() => command('Delete milestone', { type: 'delete-milestone', milestoneId: m.id })} /></Row>
            </View>; })}
            <Row><Action label={`Add task to phase: ${phase.name}`} text="Add task" disabled={project.status !== 'active'} onPress={() => addTask(phase.id)} /><Action label={`Add milestone to phase: ${phase.name}`} text="Add milestone" onPress={() => open({ kind: 'milestone', phase })} /><Action label={`Edit phase: ${phase.name}`} text="Phase actions" onPress={() => open({ kind: 'phase', phase })} /></Row>
            {phase.state === 'upcoming' ? <Row><Action label={`Move phase ${phase.name} up`} text="Move up" disabled={index === 0 || plan.phases[index - 1].state !== 'upcoming'} onPress={() => command('Reorder phase', { type: 'reorder', phaseId: phase.id, direction: -1 })} /><Action label={`Move phase ${phase.name} down`} text="Move down" disabled={index === plan.phases.length - 1} onPress={() => command('Reorder phase', { type: 'reorder', phaseId: phase.id, direction: 1 })} /></Row> : null}
            <Action label={`Delete phase: ${phase.name}`} text="Delete phase" onPress={() => open({ kind: 'delete-phase', phase })} />
            {phase.state === 'complete' ? <Action label={`Reopen phase: ${phase.name}`} text="Reopen phase" onPress={() => command('Reopen phase', { type: 'reopen', phaseId: phase.id })} /> : null}
            {phase.state === 'current' ? <><Action primary label={index === plan.phases.length - 1 ? 'Finish project' : `Complete phase: ${phase.name}`} text={index === plan.phases.length - 1 ? 'Finish project' : 'Complete phase'} disabled={project.status !== 'active' || !plan.enabled || !gate.ready || (index === plan.phases.length - 1 && !!projectBlockers(data, project).length)} onPress={() => command(index === plan.phases.length - 1 ? 'Finish project' : 'Complete phase', { type: index === plan.phases.length - 1 ? 'finish' : 'advance' })} />
              {!gate.ready || (index === plan.phases.length - 1 && projectBlockers(data, project).length) ? <View testID="plan-blockers" style={{ gap: 4 }}><Label>Before {index === plan.phases.length - 1 ? 'finishing the project' : 'advancing'}</Label>{(index === plan.phases.length - 1 ? projectBlockers(data, project) : gate.blockers).map((reason, i) => <Muted key={`${i}:${reason}`}>• {reason}</Muted>)}</View> : null}
            </> : null}
          </> : null}
        </View></PhaseDrag>;
      })}
      <Card title="Unassigned"><Muted>Required finite unassigned tasks block final completion. Recurring maintenance stays outside gates and percentage progress.</Muted>{data.tasks.filter(t => t.projectId === project.id && !t.phaseId && t.status !== 'archived').map(task => <TaskRow grouped key={task.id} task={task} data={data} />)}<Action label="Manage unassigned tasks" text="Assign / mark optional" onPress={() => open({ kind: 'assign' })} /></Card>
      {plan.started && plan.phases.every(p => p.state === 'complete') && project.status === 'active' ? <Action primary label="Finish project" onPress={() => command('Finish project', { type: 'finish' })} /> : null}
      <ProjectProgress project={project} tasks={data.tasks} />
      <Action label="Plan transition history" expanded={!(preferences.collapsed[`Plan:history:${project.id}`] ?? true)} onPress={() => pref(`Plan:history:${project.id}`, !(preferences.collapsed[`Plan:history:${project.id}`] ?? true))} />
      {preferences.collapsed[`Plan:history:${project.id}`] === false ? plan.history.map(t => <Muted key={t.id}>{t.at.slice(0, 16).replace('T', ' ')} · {plan.phases.find(p => p.id === t.phaseId)?.name ?? t.phaseName ?? project.name}: {t.from} → {t.to} · {t.cause}</Muted>) : null}
    </>}
    {editor ? <PlanEditorDialog project={editor.project} initialData={editor.data} request={editor.request} returnFocusRef={returnFocusRef} onClose={() => { if (editor.request.kind === 'create') changeView('plan'); setEditor(undefined); }} /> : null}
  </View>;
}
