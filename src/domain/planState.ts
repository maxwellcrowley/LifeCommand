import type { AppData, Project, ProjectMilestone, ProjectPhase, Task } from './models';

export const finiteTask = (task: Task) => !task.recurrenceId;
export const requiredTask = (task: Task) => finiteTask(task) && task.planRequired !== false;
export const currentPhase = (project: Project) => project.plan?.enabled && project.plan.started ? project.plan.phases.find(p => p.state === 'current') : undefined;

export function milestoneState(tasks: Task[], milestone: ProjectMilestone) {
  const linked = milestone.taskIds.map(id => tasks.find(t => t.id === id));
  const invalid = milestone.taskIds.filter((_, i) => !linked[i] || linked[i]!.projectId !== milestone.projectId || linked[i]!.phaseId !== milestone.phaseId || !finiteTask(linked[i]!) || linked[i]!.status === 'archived');
  const done = linked.filter(t => t?.status === 'complete').length;
  const valid = !invalid.length && (milestone.type === 'approval' || linked.length > 0);
  const ready = valid && done === linked.length;
  const complete = ready && (milestone.type === 'tasks' || !!milestone.approvedAt);
  const attention = !valid || !!milestone.approvalInvalidatedAt || (!!milestone.approvedAt && !ready);
  return { invalid, done, total: linked.length, ready, complete, attention,
    label: attention ? 'Needs attention' : complete ? 'Complete' : ready && milestone.type === 'approval' ? 'Ready for approval' : 'In progress' };
}

export function phaseReadiness(data: Pick<AppData, 'tasks'>, project: Project, phase: ProjectPhase) {
  const tasks = data.tasks.filter(t => t.projectId === project.id && t.phaseId === phase.id && requiredTask(t));
  const milestones = project.plan?.milestones.filter(m => m.phaseId === phase.id) ?? [];
  const blockers = tasks.filter(t => t.status !== 'complete').map(t => `${t.title}${t.status === 'archived' ? ' (archived; restore or make optional)' : ''}`);
  const required = milestones.filter(m => m.required || (phase.rule.mode === 'milestone' && phase.rule.milestoneId === m.id));
  for (const milestone of required) {
    const state = milestoneState(data.tasks, milestone);
    if (!state.complete) blockers.push(`Milestone: ${milestone.title} — ${state.label}`);
  }
  if (phase.rule.mode === 'milestone' && !milestones.some(m => m.id === phase.rule.milestoneId)) blockers.push('Repair the missing progression milestone');
  const done = tasks.filter(t => t.status === 'complete').length;
  return { tasks, total: tasks.length, done, milestones, blockers, ready: !blockers.length, empty: !tasks.length && !required.length,
    label: phase.state === 'complete' ? blockers.length ? 'Complete · Needs attention' : 'Complete' : phase.state === 'upcoming' ? 'Upcoming' : blockers.length ? 'Current' : 'Ready to advance' };
}

export function projectBlockers(data: Pick<AppData, 'tasks'>, project: Project) {
  if (!project.plan?.enabled) return [];
  const blockers: string[] = [];
  if (!project.plan.started) blockers.push('Start the project plan first');
  if (!project.plan.phases.length) blockers.push('Add a phase');
  for (const phase of project.plan.phases) {
    if (phase.state === 'upcoming') blockers.push(`${phase.name}: finish the preceding phases first`);
    blockers.push(...phaseReadiness(data, project, phase).blockers.map(reason => `${phase.name}: ${reason}`));
  }
  for (const task of data.tasks.filter(t => t.projectId === project.id && requiredTask(t) && (!t.phaseId || !project.plan!.phases.some(p => p.id === t.phaseId)) && t.status !== 'complete')) blockers.push(`Unassigned: ${task.title}`);
  return blockers;
}

export function nextMilestone(tasks: Task[], project: Project) {
  const phase = currentPhase(project);
  if (!phase) return undefined;
  return project.plan!.milestones.find(m => m.phaseId === phase.id && !milestoneState(tasks, m).complete);
}

// Includes requirements, not just the Project timestamp: a task-only update also
// invalidates an open progression preview or bulk assignment.
export function planToken(data: Pick<AppData, 'tasks'>, project: Project): string {
  return JSON.stringify([project, data.tasks.filter(t => t.projectId === project.id).map(t => [t.id, t.updatedAt, t.status, t.phaseId, t.planRequired, t.recurrenceId]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))], (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
}
export function assertPlanTokens(data: AppData, tokens?: Record<string, string>) {
  for (const [id, expected] of Object.entries(tokens ?? {})) {
    const project = data.projects.find(p => p.id === id);
    if (!project || planToken(data, project) !== expected) throw Error('Project requirements changed. Reload the task and review its plan assignment again.');
  }
}
export function taskPlanDeletionMessage(data: AppData, task: Task): string | undefined {
  const project = data.projects.find(p => p.id === task.projectId);
  if (!project?.plan || task.recurrenceId) return undefined;
  const links = project.plan.milestones.filter(m => m.taskIds.includes(task.id));
  return `Removes this task from project work. ${links.length ? `${links.length} linked milestone(s) will need explicit repair; their task links and approval history are kept.` : 'This removes its finite completion requirement.'} Eligible automatic phases may advance. Undo restores the task; it does not reverse transitions.`;
}

export function planNotices(data: AppData, project: Project): string[] {
  if (!project.plan?.enabled || !project.plan.started || project.status === 'archived') return [];
  const notices: string[] = [];
  for (const phase of project.plan.phases) {
    const gate = phaseReadiness(data, project, phase);
    if (phase.state === 'complete' && !gate.ready) notices.push(`${phase.name}: completed phase has unfinished requirements. Reopen the phase to revisit it.`);
    if (phase.state === 'current' && gate.ready) notices.push(phase === project.plan.phases.at(-1) ? projectBlockers(data, project).length ? `${phase.name}: phase ready; project still has unfinished requirements.` : 'Ready to complete — finish this project when ready.' : `${phase.name}: ready to advance.`);
  }
  for (const m of project.plan.milestones) {
    const state = milestoneState(data.tasks, m);
    if (state.attention) notices.push(`${m.title}: needs attention. Repair links or review approval.`);
    else if (m.type === 'approval' && state.ready && !state.complete) notices.push(`${m.title}: ready for manual approval.`);
  }
  if (project.status === 'complete') notices.push(...projectBlockers(data, project).filter(reason => reason.startsWith('Unassigned:')).map(reason => `Completed project has unfinished required work: ${reason}`));
  return notices;
}
