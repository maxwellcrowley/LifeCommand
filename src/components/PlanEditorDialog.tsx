import { useRef, useState } from 'react';
import { Pressable, Switch, TextInput, View, type View as NativeView } from 'react-native';
import type { AppData, Project, ProjectMilestone, ProjectPhase } from '../domain/models';
import { currentPhase, finiteTask, milestoneState, phaseAdditionBlocker, planToken, projectBlockers } from '../domain/planState';
import { newPhase, newPlanId, previewPlanCommand, transitionSummary, type PlanCommand } from '../domain/projectPlans';
import { useAppData } from '../data/useAppData';
import { useAppTheme } from '../theme/ThemeProvider';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { AppTextInput } from './AppText';
import { Action } from './Action';
import { SettingsDialog } from './SettingsDialog';
import { Label, Muted, Row } from './ui';
import { FormError } from './TaskForm';

export type PlanEditorRequest = { kind: 'create' | 'settings' | 'phase' | 'milestone' | 'assign' | 'delete-phase' | 'command'; phase?: ProjectPhase; milestone?: ProjectMilestone; command?: PlanCommand; title?: string };

export function PlanEditorDialog({ project, initialData, request, onClose, returnFocusRef }: {
  project: Project; initialData: AppData; request: PlanEditorRequest; onClose: () => void; returnFocusRef: React.RefObject<NativeView | null>;
}) {
  const { data, planAction } = useAppData(), { colors } = useAppTheme();
  const [phases, setPhases] = useState(() => [newPhase(''), newPhase(''), newPhase('')]);
  const [phase, setPhase] = useState(() => request.phase ?? newPhase(''));
  const [milestone, setMilestone] = useState<ProjectMilestone>(() => request.milestone ?? { id: newPlanId('milestone'), projectId: project.id, phaseId: request.phase?.id ?? '', title: '', type: 'tasks', taskIds: [], required: true, history: [] });
  const [action, setAction] = useState<'none' | 'phase' | 'project'>(() => request.milestone && request.phase?.rule.milestoneId === request.milestone.id ? project.plan?.phases.at(-1)?.id === request.phase.id ? 'project' : 'phase' : 'none');
  const [enabled, setEnabled] = useState(project.plan?.enabled ?? true), [automaticCompletion, setAutomaticCompletion] = useState(project.plan?.automaticCompletion ?? false);
  const [selected, setSelected] = useState<string[]>([]), [destination, setDestination] = useState(request.phase?.id ?? ''), [required, setRequired] = useState<boolean | undefined>();
  const [focusedChoice, setFocusedChoice] = useState<string>();
  const [advanced, setAdvanced] = useState(false), [dirty, setDirty] = useState(false), [discard, setDiscard] = useState(false), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ command: PlanCommand; summary: string; after: AppData }>();
  const busy = useRef(false), nameRef = useRef<TextInput>(null);
  const guard = useUnsavedChanges(dirty || saving, true);
  const token = planToken(initialData, project), latest = data?.projects.find(p => p.id === project.id);
  const stale = !latest || !data || token !== planToken(data, latest);
  const addPhaseBlocker = request.kind === 'phase' && !request.phase && latest ? phaseAdditionBlocker(latest) : undefined;
  const close = () => { if (busy.current) return; if (preview) setPreview(undefined); else if (dirty) setDiscard(true); else onClose(); };
  const change = (operation: () => void) => { setDirty(true); setError(''); operation(); };
  const fieldStyle = { color: colors.text, backgroundColor: colors.background, minHeight: 48, padding: 12, borderRadius: 10, fontSize: 16, borderWidth: 1, borderColor: colors.border };
  const input = (label: string, value: string, update: (value: string) => void, multiline = false) => <View style={{ gap: 5 }}><Label>{label}</Label><AppTextInput ref={['Phase name', 'Milestone title', 'Phase 1 name'].includes(label) ? nameRef : undefined} accessibilityLabel={label} value={value} editable={!saving} multiline={multiline} onChangeText={v => change(() => update(v))} style={[fieldStyle, multiline ? { minHeight: 76, textAlignVertical: 'top' } : {}]} /></View>;
  const radio = <T extends string,>(label: string, value: T, choices: { id: T; title: string }[], update: (value: T) => void) => <View style={{ gap: 6 }}><Label>{label}</Label><View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{choices.map(c => <Pressable key={c.id} accessibilityRole="radio" accessibilityLabel={`${label}: ${c.title}`} accessibilityState={{ checked: c.id === value, disabled: saving }} aria-checked={c.id === value} disabled={saving} onFocus={() => setFocusedChoice(`${label}:${c.id}`)} onBlur={() => setFocusedChoice(undefined)} onPress={() => change(() => update(c.id))} style={{ minHeight: 44, maxWidth: '100%', justifyContent: 'center', padding: 10, borderRadius: 10, borderWidth: 2, borderColor: focusedChoice === `${label}:${c.id}` ? colors.focus : 'transparent', backgroundColor: c.id === value ? colors.selection : colors.background }}><Label>{c.title}</Label></Pressable>)}</View></View>;
  const toggle = (label: string, value: boolean, update: (value: boolean) => void) => <Row><View style={{ flex: 1 }}><Label>{label}</Label></View><Switch accessibilityLabel={label} value={value} disabled={saving} onValueChange={v => change(() => update(v))} /></Row>;
  const phaseOptions = [{ id: '', title: 'Unassigned' }, ...(project.plan?.phases ?? []).filter(p => request.kind !== 'delete-phase' || p.id !== request.phase?.id).map(p => ({ id: p.id, title: p.name }))];
  const explain = (command: PlanCommand) => {
    if (command.type === 'create') return 'Save a draft with named, ordered phases. Next, assign existing tasks and add milestones. Review and start explicitly when ready. Project status and task dates stay as entered.';
    if (command.type === 'start') return `Start with ${project.plan?.phases[0]?.name}. The project becomes Active. Required tasks and milestones control advancement; upcoming work remains accessible.`;
    if (command.type === 'reopen') return `${project.plan?.phases.find(p => p.id === command.phaseId)?.name} becomes current. Later phases return to Upcoming. Task completion, dates and transition history are preserved. The project becomes Active.`;
    if (command.type === 'configure') return `${enabled ? 'Enable the saved plan.' : 'Disable plan gates while retaining phases, assignments and history.'} ${automaticCompletion ? 'Automatic final completion is enabled: a satisfied automatic final-phase rule can finish the project immediately once all requirements, including unassigned work, are met.' : 'Final project completion requires your explicit Finish project action.'}`;
    if (command.type === 'delete-phase') return `Remove ${request.phase?.name} and its ${project.plan?.milestones.filter(m => m.phaseId === request.phase?.id).length ?? 0} milestones. All ${initialData.tasks.filter(t => t.projectId === project.id && t.phaseId === request.phase?.id).length} tasks move to ${project.plan?.phases.find(p => p.id === command.destination)?.name ?? 'Unassigned'}. Task dates, completion and phase transition history remain. Deleting the current phase activates the following phase, or reopens the preceding phase when there is no following phase. An empty plan becomes a draft. Saved phase filters will need repair.`;
    if (command.type === 'assign') return `Move ${selected.length} tasks to ${project.plan?.phases.find(p => p.id === destination)?.name ?? 'Unassigned'}${required === undefined ? '' : required ? ' and mark them required' : ' and mark them optional'}. Dates and priority stay as entered. Linked milestones in the old phase will need explicit repair.`;
    if (command.type === 'milestone') return `${milestone.type === 'tasks' ? 'Completes only when all linked finite tasks are complete.' : 'Supporting tasks never substitute for explicit approval.'} Changing an approved linked task set invalidates its approval and keeps history. ${action !== 'none' ? 'This becomes the phase’s single progression trigger, replacing its previous rule. Other required work must also be complete.' : ''} ${action === 'project' ? 'This explicitly enables automatic project completion after all final requirements are met.' : ''}`;
    if (command.type === 'delete-milestone') return 'Remove this milestone and its requirement. If it is the progression trigger, the phase returns to Manual advancement. Its removal may make other automatic rules immediately eligible.';
    if (command.type === 'phase') return `Save ${phase.name || 'this phase'} and its single progression rule. ${phase.rule.mode === 'manual' ? 'Wait for explicit Complete phase.' : 'Advance when this phase is current and all required work and any trigger are complete. Empty phases wait.'} Final completion still follows the plan setting.`;
    if (command.type === 'reorder' || command.type === 'order') return `Reorder only upcoming phases. Stable task and milestone associations and existing phase history are retained. Final completion policy applies to whichever phase is last in the new order; triggers in earlier phases advance to the next phase.`;
    if (command.type === 'revoke') return 'Reopen this manual milestone, preserving approval history. Later phases are not rewound. A completed phase will show unfinished requirements.';
    if (command.type === 'approve') return 'Record explicit approval. Any configured progression rule will be checked against all current requirements.';
    return command.type === 'finish' ? 'Finish the final phase and project after checking all phase and unassigned requirements. Optional work remains available.' : 'Complete the current phase and activate the next. Tasks keep their dates and completion. Any subsequent eligible automatic phases are evaluated.';
  };
  const build = (): PlanCommand => {
    switch (request.kind) {
      case 'create': return { type: 'create', phases: phases.filter(p => p.name.trim()) };
      case 'settings': return { type: 'configure', enabled, automaticCompletion };
      case 'phase': return { type: 'phase', phase };
      case 'milestone': return { type: 'milestone', milestone, action };
      case 'assign': return { type: 'assign', taskIds: selected, phaseId: destination || undefined, required };
      case 'delete-phase': return { type: 'delete-phase', phaseId: request.phase!.id, destination: destination === request.phase!.id ? undefined : destination || undefined, deleteMilestones: true };
      case 'command': return request.command!;
    }
  };
  const review = () => {
    setError('');
    try { if (stale) throw Error('This project or its tasks changed. Close and reopen this editor.'); const command = build(); const after = previewPlanCommand(initialData, project.id, token, command); setPreview({ command, after, summary: transitionSummary(initialData, after) }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not review changes.'); }
  };
  const save = async () => {
    if (!preview || busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try { await planAction(project.id, token, preview.command); guard.allowLeave(); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Retry.'); }
    finally { busy.current = false; setSaving(false); }
  };
  const discarding = discard || guard.pending;
  const title = discarding ? 'Discard plan changes?' : preview ? 'Review plan changes' : request.title ?? ({ create: 'Add project plan', settings: 'Edit plan', phase: request.phase ? 'Edit phase' : 'Add phase', milestone: request.milestone ? 'Edit milestone' : 'Add milestone', assign: 'Assign project tasks', 'delete-phase': 'Delete phase', command: 'Review transition' })[request.kind];
  return <SettingsDialog title={title} onShow={() => nameRef.current?.focus()} returnFocusRef={returnFocusRef} onClose={close} footer={<>
    {addPhaseBlocker ? <FormError>{`${addPhaseBlocker} Your phase draft is kept in this editor. Copy any details you need before closing, then use Reopen phase in Plan.`}</FormError> : stale ? <FormError>The project or a task changed. Close and reopen to review the latest state.</FormError> : null}{error ? <FormError>{error}</FormError> : null}
    {discarding ? <Row><Action label="Keep editing plan" disabled={saving} onPress={() => { setDiscard(false); guard.keepEditing(); }} /><Action label="Discard plan changes" danger disabled={saving} onPress={() => { if (guard.pending) guard.discard(); else { guard.allowLeave(); onClose(); } }} /></Row> : <Row><Action label={preview ? 'Back to plan editing' : 'Cancel plan edit'} text={preview ? 'Back' : 'Cancel'} disabled={saving} onPress={close} /><Action primary label={preview ? 'Confirm plan changes' : 'Review plan changes'} text={saving ? 'Saving…' : preview ? 'Confirm changes' : 'Review changes'} disabled={saving || stale} onPress={preview ? () => void save() : review} /></Row>}
  </>}>
    {discarding ? <Muted>Discard the unsaved changes in this editor?</Muted> : preview ? <>
      <Label>{explain(preview.command)}</Label>
      {preview.summary ? <Label>Immediate effect: {preview.summary}.</Label> : <Muted>No immediate phase transition.</Muted>}
      {preview.command.type === 'start' || preview.command.type === 'create' ? <>{project.plan?.phases.map((p, i) => <Muted key={p.id}>{i + 1}. {p.name} · {initialData.tasks.filter(t => t.projectId === project.id && t.phaseId === p.id && finiteTask(t)).length} finite tasks · {p.rule.mode === 'manual' ? 'Manual advancement' : 'Automatic advancement'}</Muted>)}<Muted>{initialData.tasks.filter(t => t.projectId === project.id && !t.phaseId && finiteTask(t)).length} unassigned finite tasks remain visible. Required unassigned work blocks final completion.</Muted></> : null}
    </> : <>
      {request.kind === 'create' ? <><Muted>Name phases in the order you want to work. Save a draft, assign tasks and milestones, then review and start.</Muted>{phases.map((p, i) => <View key={p.id} style={{ gap: 6 }}>{input(`Phase ${i + 1} name`, p.name, name => setPhases(items => items.map(item => item.id === p.id ? { ...item, name } : item)))}<Row><Action label={`Move draft phase ${i + 1} up`} text="Move up" disabled={!i} onPress={() => change(() => setPhases(items => { const next = [...items]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; return next; }))} /><Action label={`Remove draft phase ${i + 1}`} text="Remove" disabled={phases.length === 1} onPress={() => change(() => setPhases(items => items.filter(item => item.id !== p.id)))} /></Row></View>)}<Action label="Add another draft phase" onPress={() => change(() => setPhases(items => [...items, newPhase('')]))} /></> : null}
      {request.kind === 'settings' ? <>{toggle('Enable project plan', enabled, setEnabled)}<Muted>Disable gates while retaining the full plan for later use.</Muted><Action label="Advanced plan options" expanded={advanced} onPress={() => setAdvanced(!advanced)} />{advanced ? <>{toggle('Automatically finish project', automaticCompletion, setAutomaticCompletion)}<Muted>Only an eligible automatic final-phase rule can finish the project. All required finite work, including Unassigned, must be complete. Saving previews any immediate effect.</Muted></> : null}</> : null}
      {request.kind === 'phase' ? <>
        {input('Phase name', phase.name, name => setPhase({ ...phase, name }))}
        {input('Phase description (optional)', phase.description ?? '', description => setPhase({ ...phase, description: description || undefined }), true)}
        {input('Phase target date (optional, YYYY-MM-DD)', phase.targetDate ?? '', targetDate => setPhase({ ...phase, targetDate: targetDate || undefined }))}
        <Action label="Phase progression options" expanded={advanced} onPress={() => setAdvanced(!advanced)} />
        {advanced ? <>{radio('Phase progression', phase.rule.mode, [{ id: 'manual', title: 'Manual advancement' }, { id: 'required', title: 'When required work is complete' }, { id: 'milestone', title: 'After a selected milestone' }], mode => setPhase({ ...phase, rule: { mode, ...(mode === 'milestone' ? { milestoneId: phase.rule.milestoneId ?? project.plan?.milestones.find(m => m.phaseId === phase.id)?.id } : {}) } }))}
          {phase.rule.mode === 'milestone' ? radio('Trigger milestone', phase.rule.milestoneId ?? '', (project.plan?.milestones.filter(m => m.phaseId === phase.id) ?? []).map(m => ({ id: m.id, title: m.title })), milestoneId => setPhase({ ...phase, rule: { mode: 'milestone', milestoneId } })) : null}<Muted>Required tasks and milestones must also be complete. Empty phases always wait. Save reviews the immediate effect.</Muted></> : null}
      </> : null}
      {request.kind === 'milestone' ? <>
        {input('Milestone title', milestone.title, title => setMilestone({ ...milestone, title }))}
        {radio('Milestone type', milestone.type, [{ id: 'tasks', title: 'Task-based' }, { id: 'approval', title: 'Manual approval' }], type => setMilestone({ ...milestone, type }))}
        <Muted>{milestone.type === 'tasks' ? 'Completes when every selected finite task is complete; select at least one.' : 'Requires explicit approval; finishing supporting tasks never approves it for you.'}</Muted>
        {toggle('Required milestone', milestone.required, required => setMilestone({ ...milestone, required }))}
        <Label>{milestone.type === 'tasks' ? 'Linked tasks' : 'Supporting tasks (optional)'}</Label>
        {[...new Set([...initialData.tasks.filter(t => t.projectId === project.id && t.phaseId === milestone.phaseId && finiteTask(t) && t.status !== 'archived').map(t => t.id), ...milestone.taskIds])].map(id => { const t = initialData.tasks.find(t => t.id === id); const invalid = !t || t.projectId !== project.id || t.phaseId !== milestone.phaseId || !finiteTask(t) || t.status === 'archived'; return <Pressable key={id} accessibilityRole="checkbox" accessibilityLabel={`Link task: ${t?.title ?? id}`} accessibilityState={{ checked: milestone.taskIds.includes(id) }} aria-checked={milestone.taskIds.includes(id)} onPress={() => change(() => setMilestone({ ...milestone, taskIds: milestone.taskIds.includes(id) ? milestone.taskIds.filter(value => value !== id) : [...milestone.taskIds, id] }))} style={{ minHeight: 48, padding: 10, backgroundColor: colors.background, borderRadius: 8 }}><Label>{milestone.taskIds.includes(id) ? '✓ ' : ''}{t?.title ?? `Missing task ${id}`}{invalid ? ' · Needs attention: remove link or restore task' : ''}</Label></Pressable>; })}
        <Action label="Advanced milestone options" expanded={advanced} onPress={() => setAdvanced(!advanced)} />
        {advanced ? <>{input('Milestone description (optional)', milestone.description ?? '', description => setMilestone({ ...milestone, description: description || undefined }), true)}{input('Milestone target date (optional, YYYY-MM-DD)', milestone.targetDate ?? '', targetDate => setMilestone({ ...milestone, targetDate: targetDate || undefined }))}
          {radio('On completion', action, [{ id: 'none', title: 'No progression action' }, ...(project.plan?.phases.at(-1)?.id === milestone.phaseId ? [{ id: 'project' as const, title: 'Complete the project' }] : [{ id: 'phase' as const, title: 'Complete phase and activate next' }])], setAction)}<Muted>This edits the phase’s single progression rule. Other required work must also be complete.</Muted></> : null}
        {request.milestone?.history.length ? <Muted>{request.milestone.history.length} completion / approval history entries retained.</Muted> : null}
      </> : null}
      {request.kind === 'assign' ? <>
        <Muted>Select finite tasks from this project. Recurring maintenance stays outside phase gates. The complete selection is checked again when saving.</Muted>
        {radio('Move selected tasks to', destination, phaseOptions, setDestination)}
        {radio('Requirement', required === undefined ? 'keep' : required ? 'required' : 'optional', [{ id: 'keep', title: 'Keep existing' }, { id: 'required', title: 'Required' }, { id: 'optional', title: 'Optional' }], value => setRequired(value === 'keep' ? undefined : value === 'required'))}
        <Row><Action label="Select all finite project tasks" onPress={() => change(() => setSelected(initialData.tasks.filter(t => t.projectId === project.id && finiteTask(t)).map(t => t.id)))} /><Action label="Clear task assignment selection" onPress={() => change(() => setSelected([]))} /></Row>
        {initialData.tasks.filter(t => t.projectId === project.id && finiteTask(t)).map(t => <Pressable key={t.id} accessibilityRole="checkbox" accessibilityLabel={`Assign task: ${t.title}`} accessibilityState={{ checked: selected.includes(t.id) }} aria-checked={selected.includes(t.id)} onPress={() => change(() => setSelected(ids => ids.includes(t.id) ? ids.filter(id => id !== t.id) : [...ids, t.id]))} style={{ minHeight: 48, padding: 10, gap: 3, backgroundColor: colors.background, borderRadius: 8 }}><Label>{selected.includes(t.id) ? '✓ ' : ''}{t.title}</Label><Muted>{project.plan?.phases.find(p => p.id === t.phaseId)?.name ?? 'Unassigned'} · {t.planRequired === false ? 'Optional' : 'Required'} · {t.status}</Muted></Pressable>)}
      </> : null}
      {request.kind === 'delete-phase' ? <><Muted>{explain(build())}</Muted>{radio('Move retained tasks to', destination === request.phase?.id ? '' : destination, phaseOptions, setDestination)}<Muted>Confirming removes the milestones in this phase. Their links and approvals will no longer gate progression.</Muted></> : null}
      {request.kind === 'command' ? <><Label>{explain(request.command!)}</Label>{request.command?.type === 'finish' ? projectBlockers(initialData, project).map(b => <Muted key={b}>• {b}</Muted>) : null}{request.command?.type === 'approve' ? <Muted>{milestoneState(initialData.tasks, project.plan!.milestones.find(m => m.id === (request.command as { milestoneId: string }).milestoneId)!).label}</Muted> : null}{currentPhase(project) ? <Muted>Current phase: {currentPhase(project)!.name}</Muted> : null}</> : null}
    </>}
  </SettingsDialog>;
}
