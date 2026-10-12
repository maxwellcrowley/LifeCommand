import type { AppData, ProjectPlan } from './models';
import { isDateKey } from './dates';

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid project plan object. Restore a valid backup or repair the plan.');
  return value as Record<string, unknown>;
};
const text = (value: unknown) => typeof value === 'string' && !!value.trim();
const instant = (value: unknown) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
function keys(value: Record<string, unknown>, allowed: string[]) { if (Object.keys(value).some(key => !allowed.includes(key))) throw Error('Unsupported project plan field. Update LifeCommand before opening this data.'); }
function list(value: unknown): Record<string, unknown>[] { if (!Array.isArray(value)) throw Error('Project plan collections must be arrays.'); return value.map(object); }
function unique(values: Record<string, unknown>[]) { if (values.some(v => !text(v.id)) || new Set(values.map(v => v.id)).size !== values.length) throw Error('Project plan IDs must be nonempty and unique.'); }
function optional(value: Record<string, unknown>) {
  if (value.description !== undefined && typeof value.description !== 'string') throw Error('Plan descriptions must be text.');
  if (value.targetDate !== undefined && (typeof value.targetDate !== 'string' || !isDateKey(value.targetDate))) throw Error('Use a valid optional plan target date.');
}
export function validatePlanShape(value: unknown): ProjectPlan {
  const plan = object(value);
  keys(plan, ['enabled', 'started', 'automaticCompletion', 'revision', 'phases', 'milestones', 'history']);
  if (['enabled', 'started', 'automaticCompletion'].some(key => typeof plan[key] !== 'boolean') || !Number.isSafeInteger(plan.revision) || Number(plan.revision) < 1) throw Error('Invalid project plan settings or revision.');
  const phases = list(plan.phases), milestones = list(plan.milestones), history = list(plan.history);
  unique(phases); unique(milestones); unique(history);
  if (phases.length > 200) throw Error('A project supports up to 200 sequential phases.');
  let upcoming = false, current = false;
  for (const phase of phases) {
    keys(phase, ['id', 'name', 'description', 'targetDate', 'state', 'rule']); optional(phase);
    if (!text(phase.name) || !['upcoming', 'current', 'complete'].includes(String(phase.state))) throw Error('Choose a phase name and valid state.');
    if (phase.state === 'complete' && (current || upcoming)) throw Error('Completed phases must precede the current and upcoming phases.');
    if (phase.state === 'current') { if (current || upcoming) throw Error('A plan has one sequential current phase.'); current = true; }
    if (phase.state === 'upcoming') upcoming = true;
    if (!plan.started && phase.state !== 'upcoming') throw Error('Draft plan phases must be upcoming.');
    const rule = object(phase.rule); keys(rule, ['mode', 'milestoneId']);
    if (!['manual', 'required', 'milestone'].includes(String(rule.mode)) || (rule.mode === 'milestone' ? !text(rule.milestoneId) : rule.milestoneId !== undefined)) throw Error('Choose one valid phase progression rule.');
    // Missing triggers are retained as repairable gate blockers, just like task links.
  }
  if (plan.started && phases.length && !current && phases.some(p => p.state !== 'complete')) throw Error('A started plan needs exactly one current phase until all phases complete.');
  for (const m of milestones) {
    keys(m, ['id', 'projectId', 'phaseId', 'title', 'description', 'targetDate', 'type', 'taskIds', 'required', 'approvedAt', 'approvalInvalidatedAt', 'history']); optional(m);
    if (!text(m.title) || !text(m.projectId) || !phases.some(p => p.id === m.phaseId) || !['tasks', 'approval'].includes(String(m.type)) || typeof m.required !== 'boolean') throw Error('Invalid milestone fields or phase association.');
    if (!Array.isArray(m.taskIds) || m.taskIds.some(id => !text(id)) || new Set(m.taskIds).size !== m.taskIds.length || (m.type === 'tasks' && !m.taskIds.length)) throw Error('Task-based milestones need at least one distinct finite task.');
    if ((m.approvedAt !== undefined && !instant(m.approvedAt)) || (m.approvalInvalidatedAt !== undefined && !instant(m.approvalInvalidatedAt)) || (m.type === 'tasks' && m.approvedAt)) throw Error('Invalid milestone approval timestamp.');
    const audit = list(m.history); unique(audit);
    for (const entry of audit) { keys(entry, ['id', 'at', 'action']); if (!instant(entry.at) || !['complete', 'reopen', 'approve', 'invalidate'].includes(String(entry.action))) throw Error('Invalid milestone history.'); }
  }
  for (const entry of history) {
    keys(entry, ['id', 'phaseId', 'phaseName', 'from', 'to', 'at', 'cause', 'milestoneId']);
    if (!instant(entry.at) || !['manual', 'required', 'milestone', 'reopen'].includes(String(entry.cause)) || !['draft', 'upcoming', 'current', 'complete', 'active', 'paused', 'archived'].includes(String(entry.from)) || !['upcoming', 'current', 'complete', 'active', 'paused', 'archived'].includes(String(entry.to))) throw Error('Invalid plan transition history.');
    if ((entry.phaseId !== undefined && !text(entry.phaseId)) || (entry.phaseName !== undefined && !text(entry.phaseName)) || (entry.milestoneId !== undefined && !text(entry.milestoneId))) throw Error('Invalid transition reference.');
  }
  return JSON.parse(JSON.stringify(value)) as ProjectPlan;
}

export function validatePlanReferences(data: AppData) {
  const phaseIds = new Set<string>(), milestoneIds = new Set<string>();
  for (const p of data.projects) if (p.plan) {
    validatePlanShape(p.plan);
    for (const phase of p.plan.phases) { if (phaseIds.has(phase.id)) throw Error('Phase IDs must be unique across projects.'); phaseIds.add(phase.id); }
    for (const milestone of p.plan.milestones) { if (milestoneIds.has(milestone.id)) throw Error('Milestone IDs must be unique across projects.'); milestoneIds.add(milestone.id); }
    if (p.plan.milestones.some(m => m.projectId !== p.id)) throw Error('Milestone belongs to a different project.');
  }
  for (const t of data.tasks) {
    if (t.planRequired !== undefined && typeof t.planRequired !== 'boolean') throw Error('Task requirement must be on or off.');
    if (t.phaseId && (!data.projects.find(p => p.id === t.projectId)?.plan?.phases.some(p => p.id === t.phaseId) || t.recurrenceId)) throw Error('Task phase must belong to its project; recurring maintenance cannot belong to a finite phase.');
  }
}
