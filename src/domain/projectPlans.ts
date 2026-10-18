import type { AppData, PlanTransition, Project, ProjectMilestone, ProjectPhase, ProjectPlan } from './models';
import { currentPhase, finiteTask, milestoneState, phaseAdditionBlocker, phaseReadiness, planToken, projectBlockers } from './planState';
import { validatePlanReferences } from './planValidation';

export const newPlanId = (kind: string) => `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
export const newPhase = (name: string): ProjectPhase => ({ id: newPlanId('phase'), name, state: 'upcoming', rule: { mode: 'manual' } });
export const draftPlan = (phases: ProjectPhase[] = []): ProjectPlan => ({ enabled: true, started: false, automaticCompletion: false, revision: 1, phases, milestones: [], history: [] });
const stamp = (project: Project, now: Date) => new Date(Math.max(now.getTime(), Date.parse(project.updatedAt) + 1)).toISOString();
const replace = (data: AppData, project: Project) => ({ ...data, projects: data.projects.map(p => p.id === project.id ? project : p) });
function revise(project: Project, plan: ProjectPlan, now: Date, status = project.status): Project {
  return { ...project, status, plan: { ...plan, revision: (project.plan?.revision ?? 0) + 1 }, updatedAt: stamp(project, now) };
}
function record(project: Project, plan: ProjectPlan, phaseId: string | undefined, from: PlanTransition['from'], to: PlanTransition['to'], cause: PlanTransition['cause'], at: string, milestoneId?: string) {
  const id = `${project.id}:${plan.revision}:${phaseId ?? 'project'}:${from}:${to}:${cause}`;
  if (plan.history.some(t => t.id === id)) return plan;
  return { ...plan, history: [...plan.history, { id, phaseId, phaseName: plan.phases.find(p => p.id === phaseId)?.name, from, to, cause, at, milestoneId }] };
}
function advance(data: AppData, project: Project, now: Date, cause: PlanTransition['cause'], finish: boolean): Project {
  const plan = project.plan!, phase = currentPhase(project);
  if (!plan.started || !plan.enabled || project.status !== 'active') throw Error('Start or resume this project plan before advancing.');
  const index = phase ? plan.phases.indexOf(phase) : -1;
  if (!phase && !plan.phases.every(p => p.state === 'complete')) throw Error('Choose a current phase first.');
  const blockers = finish ? projectBlockers(data, project) : phase ? phaseReadiness(data, project, phase).blockers : ['All phases are complete. Finish the project.'];
  if (blockers.length) throw Error(`Cannot ${finish ? 'finish project' : 'complete phase'}: ${blockers.join('; ')}.`);
  if (!finish && index === plan.phases.length - 1) throw Error('This is the final phase. Use Finish project to confirm completion.');
  const at = stamp(project, now);
  let next = plan;
  if (phase) {
    next = record(project, next, phase.id, 'current', 'complete', cause, at, phase.rule.milestoneId);
    next = { ...next, phases: next.phases.map((p, i) => i === index ? { ...p, state: 'complete' } : !finish && i === index + 1 ? { ...p, state: 'current' } : p) };
    if (!finish && plan.phases[index + 1]) next = record(project, next, plan.phases[index + 1].id, 'upcoming', 'current', cause, at, phase.rule.milestoneId);
  }
  if (finish) next = record(project, next, undefined, project.status, 'complete', cause, at, phase?.rule.milestoneId);
  return revise(project, next, now, finish ? 'complete' : project.status);
}

export type PlanCommand =
  | { type: 'create'; phases: ProjectPhase[] }
  | { type: 'configure'; enabled: boolean; automaticCompletion: boolean }
  | { type: 'start' | 'advance' | 'finish' }
  | { type: 'reopen'; phaseId: string }
  | { type: 'phase'; phase: ProjectPhase }
  | { type: 'reorder'; phaseId: string; direction: -1 | 1 }
  | { type: 'order'; phaseIds: string[] }
  | { type: 'delete-phase'; phaseId: string; destination?: string; deleteMilestones: boolean }
  | { type: 'milestone'; milestone: ProjectMilestone; action: 'none' | 'phase' | 'project' }
  | { type: 'delete-milestone' | 'approve' | 'revoke'; milestoneId: string }
  | { type: 'assign'; taskIds: string[]; phaseId?: string; required?: boolean };

export function applyPlanCommand(data: AppData, projectId: string, expected: string, command: PlanCommand, now = new Date()): AppData {
  const project = data.projects.find(p => p.id === projectId);
  if (project && command.type === 'phase' && !project.plan?.phases.some(p => p.id === command.phase.id)) {
    const blocker = phaseAdditionBlocker(project);
    if (blocker) throw Error(blocker);
  }
  if (!project || planToken(data, project) !== expected) throw Error('This project or its tasks changed. Reload the plan and review the consequences again.');
  if (command.type === 'create') {
    if (project.plan) throw Error('This project already has a plan.');
    if (!command.phases.length) throw Error('Name at least one phase.');
    const result = replace(data, revise(project, draftPlan(command.phases.map(p => ({ ...p, state: 'upcoming', rule: { mode: 'manual' } }))), now));
    validatePlanReferences(result); return result;
  }
  if (!project.plan) throw Error('Add a project plan first.');
  let plan: ProjectPlan = JSON.parse(JSON.stringify(project.plan)) as ProjectPlan, tasks = data.tasks;
  const phase = (id: string) => { const p = plan.phases.find(p => p.id === id); if (!p) throw Error('This phase no longer exists.'); return p; };
  const at = stamp(project, now);
  let status = project.status;
  if (command.type === 'configure') plan = { ...plan, enabled: command.enabled, automaticCompletion: command.automaticCompletion };
  if (command.type === 'start') {
    if (plan.started || !plan.enabled || !plan.phases.length || project.status === 'archived' || project.status === 'complete') throw Error('Enable this draft plan in an active or paused project before starting.');
    plan.started = true; plan.phases[0].state = 'current'; status = 'active';
    plan = record(project, plan, plan.phases[0].id, 'upcoming', 'current', 'manual', at);
    if (project.status !== status) plan = record(project, plan, undefined, project.status, status, 'manual', at);
  }
  if (command.type === 'advance' || command.type === 'finish') return replace(data, advance(data, project, now, 'manual', command.type === 'finish'));
  if (command.type === 'reopen') {
    const index = plan.phases.indexOf(phase(command.phaseId));
    if (!plan.started || plan.phases[index].state !== 'complete') throw Error('Choose a completed phase to reopen.');
    plan.enabled = true;
    for (let i = index; i < plan.phases.length; i++) {
      const p = plan.phases[i], next = i === index ? 'current' : 'upcoming';
      if (p.state !== next) plan = record(project, plan, p.id, p.state, next, 'reopen', at);
      plan.phases[i] = { ...p, state: next };
    }
    if (project.status !== 'active') plan = record(project, plan, undefined, project.status, 'active', 'reopen', at);
    status = 'active';
  }
  if (command.type === 'phase') {
    const existing = plan.phases.find(p => p.id === command.phase.id);
    const next = { ...command.phase, name: command.phase.name.trim(), state: existing?.state ?? 'upcoming' as const };
    if (existing) plan.phases = plan.phases.map(p => p.id === next.id ? next : p); else plan.phases.push(next);
  }
  if (command.type === 'reorder') {
    const p = phase(command.phaseId), index = plan.phases.indexOf(p), target = plan.phases[index + command.direction];
    if (p.state !== 'upcoming' || !target || target.state !== 'upcoming') throw Error('Only upcoming phases can change order. Current and completed history stays in place.');
    [plan.phases[index], plan.phases[index + command.direction]] = [target, p];
  }
  if (command.type === 'order') {
    if (command.phaseIds.length !== plan.phases.length || new Set(command.phaseIds).size !== plan.phases.length || command.phaseIds.some(id => !plan.phases.some(p => p.id === id))) throw Error('Reorder the complete existing phase list.');
    const next = command.phaseIds.map(phase);
    if (plan.phases.some((p, i) => p.state !== 'upcoming' && next[i].id !== p.id)) throw Error('Only upcoming phases can change order.');
    plan.phases = next;
  }
  if (command.type === 'delete-phase') {
    const removed = phase(command.phaseId), index = plan.phases.indexOf(removed);
    if (command.destination === command.phaseId) throw Error('Choose a different destination.');
    if (command.destination) phase(command.destination);
    if (plan.milestones.some(m => m.phaseId === command.phaseId) && !command.deleteMilestones) throw Error('Explicitly confirm removal of this phase’s milestones. Tasks will be retained.');
    tasks = tasks.map(t => t.projectId === projectId && t.phaseId === command.phaseId ? { ...t, phaseId: command.destination, updatedAt: new Date(Math.max(now.getTime(), Date.parse(t.updatedAt) + 1)).toISOString() } : t);
    plan = record(project, plan, removed.id, removed.state, 'archived', 'manual', at);
    plan.phases = plan.phases.filter(p => p.id !== command.phaseId);
    plan.milestones = plan.milestones.filter(m => m.phaseId !== command.phaseId);
    if (removed.state === 'current' && plan.phases.length) {
      const next = plan.phases[index] ?? plan.phases.at(-1)!;
      plan = record(project, plan, next.id, next.state, 'current', next.state === 'complete' ? 'reopen' : 'manual', at);
      next.state = 'current';
    }
    if (!plan.phases.length) plan.started = false;
  }
  if (command.type === 'assign') {
    if (command.phaseId) phase(command.phaseId);
    if (!command.taskIds.length || new Set(command.taskIds).size !== command.taskIds.length) throw Error('Select distinct tasks to move.');
    for (const id of command.taskIds) {
      const task = tasks.find(t => t.id === id);
      if (!task || task.projectId !== projectId || !finiteTask(task)) throw Error('All selected tasks must still be finite tasks in this project. Nothing was moved.');
    }
    tasks = tasks.map(t => command.taskIds.includes(t.id) ? { ...t, phaseId: command.phaseId, ...(command.required === undefined ? {} : { planRequired: command.required }), updatedAt: new Date(Math.max(now.getTime(), Date.parse(t.updatedAt) + 1)).toISOString() } : t);
  }
  if (command.type === 'milestone') {
    const m = JSON.parse(JSON.stringify(command.milestone)) as ProjectMilestone, p = phase(m.phaseId), previous = plan.milestones.find(item => item.id === m.id);
    if (m.projectId !== projectId || (previous && previous.phaseId !== m.phaseId)) throw Error('Milestones stay in their phase. Create a new milestone to move the goal.');
    for (const id of m.taskIds) if (!previous?.taskIds.includes(id) && !tasks.some(t => t.id === id && t.projectId === projectId && t.phaseId === m.phaseId && finiteTask(t) && t.status !== 'archived')) throw Error('Link finite tasks in this phase.');
    m.title = m.title.trim(); m.history = previous?.history ?? []; m.approvedAt = previous?.approvedAt; m.approvalInvalidatedAt = previous?.approvalInvalidatedAt;
    const materiallyChanged = previous && (previous.type !== m.type || [...previous.taskIds].sort().join('\n') !== [...m.taskIds].sort().join('\n'));
    if (materiallyChanged && previous.approvedAt) { m.approvedAt = undefined; m.approvalInvalidatedAt = at; m.history = [...m.history, { id: `${m.id}:${plan.revision}:invalidate`, action: 'invalidate', at }]; }
    if (m.type === 'tasks') { m.approvedAt = undefined; m.approvalInvalidatedAt = undefined; }
    plan.milestones = [...plan.milestones.filter(item => item.id !== m.id), m];
    if (command.action !== 'none') {
      if (command.action === 'project' && p !== plan.phases.at(-1)) throw Error('Only a final-phase milestone can finish the project.');
      if (command.action === 'phase' && p === plan.phases.at(-1)) throw Error('The final phase uses Finish project.');
      p.rule = { mode: 'milestone', milestoneId: m.id };
      if (command.action === 'project') plan.automaticCompletion = true;
    } else if (p.rule.milestoneId === m.id) p.rule = { mode: 'manual' };
  }
  if (command.type === 'approve' || command.type === 'revoke' || command.type === 'delete-milestone') {
    const m = plan.milestones.find(m => m.id === command.milestoneId);
    if (!m) throw Error('This milestone no longer exists.');
    if (command.type === 'delete-milestone') {
      plan.milestones = plan.milestones.filter(item => item.id !== m.id);
      for (const p of plan.phases) if (p.rule.milestoneId === m.id) p.rule = { mode: 'manual' };
    } else {
      if (m.type !== 'approval') throw Error('Task-based milestones complete only through their linked tasks.');
      if (command.type === 'approve' && !milestoneState(tasks, m).ready) throw Error('Complete or repair supporting tasks before approving.');
      m.approvedAt = command.type === 'approve' ? at : undefined; m.approvalInvalidatedAt = undefined;
      m.history.push({ id: `${m.id}:${plan.revision}:${command.type}`, at, action: command.type === 'approve' ? 'approve' : 'reopen' });
    }
  }
  const result = replace({ ...data, tasks }, revise(project, plan, now, status));
  validatePlanReferences(result); return result;
}

function relevant(data: AppData, projectId: string) {
  // Maintenance creation/completion cannot replay an imported ready gate. A
  // finite-to-recurring conversion still changes this set and repairs approvals.
  return JSON.stringify(data.tasks.filter(t => t.projectId === projectId && finiteTask(t)).map(t => [t.id, t.phaseId, t.planRequired, t.status === 'complete' || t.status === 'archived' ? t.status : 'open', t.recurrenceId]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

// Called inside the same repository queue as relevant mutations. Import, restore,
// load and Undo intentionally do not call this evaluator.
export function reconcilePlans(before: AppData, after: AppData, now?: Date, automatic = true): AppData {
  let result = after;
  for (const original of after.projects) {
    if (!original.plan) continue;
    const previous = before.projects.find(p => p.id === original.id);
    if (previous && JSON.stringify(previous.plan) === JSON.stringify(original.plan) && previous.status === original.status && relevant(before, original.id) === relevant(after, original.id)) continue;
    let project = original, plan = project.plan!;
    const time = now ?? new Date(Math.max(Date.parse(project.updatedAt), ...after.tasks.filter(t => t.projectId === project.id).map(t => Date.parse(t.updatedAt))));
    let changed = false;
    const milestones = plan.milestones.map(m => {
      const old = previous?.plan?.milestones.find(item => item.id === m.id);
      const state = milestoneState(after.tasks, m), oldState = old ? milestoneState(before.tasks, old) : undefined;
      if (m.type === 'approval' && m.approvedAt && !state.ready) { changed = true; return { ...m, approvedAt: undefined, approvalInvalidatedAt: time.toISOString(), history: [...m.history, { id: `${m.id}:${plan.revision}:${m.history.length}:invalidate`, at: time.toISOString(), action: 'invalidate' as const }] }; }
      if (m.type === 'tasks' && state.complete !== (oldState?.complete ?? false)) { changed = true; const action = state.complete ? 'complete' as const : 'reopen' as const; return { ...m, history: [...m.history, { id: `${m.id}:${plan.revision}:${m.history.length}:${action}`, at: time.toISOString(), action }] }; }
      return m;
    });
    if (changed) { project = revise(project, { ...plan, milestones }, time); plan = project.plan!; }
    // Explicit reopening never immediately re-closes already-complete work.
    const reopened = plan.history.length > (previous?.plan?.history.length ?? 0) && plan.history.at(-1)?.cause === 'reopen';
    if (automatic && !reopened && plan.enabled && plan.started && project.status === 'active') {
      for (let step = 0; step < plan.phases.length; step++) {
        const phase = currentPhase(project);
        if (!phase || phase.rule.mode === 'manual') break;
        const gate = phaseReadiness(after, project, phase);
        if (gate.empty || !gate.ready) break;
        const final = phase.id === project.plan!.phases.at(-1)?.id;
        if (final && (!project.plan!.automaticCompletion || projectBlockers(after, project).length)) break;
        project = advance(after, project, time, phase.rule.mode, final);
        if (final) break;
      }
    }
    if (project !== original) result = replace(result, project);
  }
  validatePlanReferences(result);
  return result;
}

export function previewPlanCommand(data: AppData, projectId: string, token: string, command: PlanCommand, now = new Date()) {
  return reconcilePlans(data, applyPlanCommand(data, projectId, token, command, now), now);
}

export function transitionSummary(before: AppData, after: AppData): string {
  return after.projects.flatMap(p => {
    const old = before.projects.find(item => item.id === p.id)?.plan?.history ?? [];
    const added = p.plan?.history.filter(t => !old.some(o => o.id === t.id)) ?? [];
    return added.filter(t => t.to === 'current' || (!t.phaseId && t.to === 'complete')).map(t => {
      const completed = added.slice(0, added.indexOf(t)).reverse().find(item => item.phaseId && item.to === 'complete');
      const prefix = completed ? `${completed.phaseName ?? p.plan!.phases.find(phase => phase.id === completed.phaseId)?.name ?? 'Phase'} complete; ` : '';
      return t.phaseId ? `${p.name}: ${prefix}${p.plan!.phases.find(phase => phase.id === t.phaseId)?.name ?? 'phase'} is now current` : `${prefix}${p.name} is complete`;
    });
  }).join('. ');
}
