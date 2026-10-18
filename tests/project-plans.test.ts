import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AppData, ProjectMilestone, ProjectPhase } from '../src/domain/models';
import { createDefaultAppData } from '../src/domain/defaults';
import { createProject, changeProject, getProjectNextTask, getProjectProgress } from '../src/domain/projects';
import { createTask, changeTask, deleteTask } from '../src/domain/tasks';
import { applyPlanCommand, draftPlan, previewPlanCommand, reconcilePlans, type PlanCommand } from '../src/domain/projectPlans';
import { assertPlanTokens, nextMilestone, milestoneState, phaseAdditionBlocker, phaseReadiness, planToken, projectBlockers, planNotices } from '../src/domain/planState';
import { createExport, validateImport, validateSnapshot } from '../src/domain/transfer';
import { migrateSnapshot, persistedSnapshot } from '../src/domain/migrations';
import { createRepository, STORAGE_KEY } from '../src/data/storage';
import { planMergeImport } from '../src/domain/mergeImport';
import { applyTaskUndo, taskUndo } from '../src/domain/undo';
import { fingerprint, createAutomaticSync } from '../src/cloud/automatic';
import { CloudConflictError, type CloudSnapshot } from '../src/cloud/sync';
import { accountStorage } from '../src/data/accountStorage';
import { calendarDays } from '../src/domain/events';
import { searchData } from '../src/domain/search';
import { normalizePresentation } from '../src/domain/presentation';
import { notificationPlan } from '../src/notifications/service';
import { rolloverAppData } from '../src/domain/rollover';
import { convertTaskToSeries, materializeRecurrences } from '../src/domain/recurrence';
import type { RecurringSeries } from '../src/domain/models';

const now = new Date('2026-10-12T12:00:00Z');
const phases = (): ProjectPhase[] => ['Discover', 'Build', 'Launch'].map((name, i) => ({ id: `phase-${i}`, name, state: 'upcoming', rule: { mode: 'manual' } }));
export function planFixture(): AppData {
  const data = createDefaultAppData();
  const project = { ...createProject({ name: 'Synthetic launch', sectionId: 'work' }, now), id: 'planned', plan: draftPlan(phases()) };
  data.projects = [project];
  data.tasks = Array.from({ length: 33 }, (_, i) => ({ ...createTask({ title: `Work ${i + 1}`, sectionId: 'work', projectId: project.id, phaseId: `phase-${Math.floor(i / 11)}`, planRequired: i % 11 !== 10 }, now), id: `work-${i}` }));
  return data;
}
const p = (data: AppData) => data.projects[0];
const run = (data: AppData, command: PlanCommand) => previewPlanCommand(data, p(data).id, planToken(data, p(data)), command, now);
const done = (data: AppData, id: string) => reconcilePlans(data, changeTask(data, id, { status: 'complete' }, undefined, data.tasks.find(t => t.id === id)!.updatedAt, now), now);
const finishPhaseTasks = (data: AppData, index: number) => data.tasks.filter(t => t.phaseId === `phase-${index}` && t.planRequired !== false).reduce((d, t) => done(d, t.id), data);
const milestone = (patch: Partial<ProjectMilestone> = {}): ProjectMilestone => ({ id: 'gate', projectId: 'planned', phaseId: 'phase-0', title: 'Scope agreed', type: 'tasks', taskIds: ['work-0', 'work-1'], required: true, history: [], ...patch });
const memory = (data: AppData) => { const values = new Map([[STORAGE_KEY, JSON.stringify(persistedSnapshot(data, 1))]]); return { values, getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); }, getAllKeys: async () => [...values.keys()], removeItem: async (key: string) => { values.delete(key); } }; };

test('completed project requires explicit phase reopening before adding work, preserving tasks and history', () => {
  let data = planFixture(); p(data).plan!.phases = [phases()[0]];
  data.tasks = data.tasks.filter(t => t.phaseId === 'phase-0');
  data = run(data, { type: 'start' }); data = finishPhaseTasks(data, 0); data = run(data, { type: 'finish' });
  const before = structuredClone(data);
  const command: PlanCommand = { type: 'phase', phase: { ...phases()[1], name: 'Follow-up' } };
  assert.match(phaseAdditionBlocker(p(data))!, /Reopen the project/);
  assert.throws(() => run(data, command), /Reopen the project before adding phases/);
  assert.deepEqual(data, before);
  // All-complete plans still need explicit phase reopening even if status was resumed separately.
  assert.ok(phaseAdditionBlocker({ ...p(data), status: 'active' }));
  data = run(data, { type: 'reopen', phaseId: 'phase-0' });
  assert.equal(phaseAdditionBlocker(p(data)), undefined);
  data = run(data, command);
  assert.equal(p(data).status, 'active');
  assert.deepEqual(p(data).plan!.phases.map(p => p.state), ['current', 'upcoming']);
  assert.deepEqual(data.tasks, before.tasks);
  assert.deepEqual(p(data).plan!.history.slice(0, p(before).plan!.history.length), JSON.parse(JSON.stringify(p(before).plan!.history)));
  assert.doesNotThrow(() => validateSnapshot(data));
});

test('cloud completion rejects a pending Add phase with actionable guidance and no overwrite', async () => {
  let data = planFixture(); p(data).plan!.phases = [phases()[0]]; data.tasks = [];
  data = run(data, { type: 'start' });
  const repository = createRepository(memory(data)); const local = await repository.loadAppData();
  const token = planToken(local, p(local));
  const draft: PlanCommand = { type: 'phase', phase: { ...phases()[1], name: 'Retained phase draft' } };
  const completed = run(local, { type: 'finish' });
  const accepted = await repository.applyCloudData(completed, fingerprint(local));
  await assert.rejects(repository.changeAppData(current => applyPlanCommand(current, 'planned', token, draft)), /Reopen the project before adding phases/);
  assert.equal(draft.phase.name, 'Retained phase draft');
  assert.deepEqual(await repository.loadAppData(), accepted);
});

test('completed ordinary project blocks initial plan creation until explicit reopening', () => {
  const data = planFixture(); delete p(data).plan; data.tasks = [];
  const complete = changeProject(data, p(data).id, { status: 'complete' }, p(data).updatedAt, now);
  const before = structuredClone(complete);
  assert.throws(() => run(complete, { type: 'create', phases: phases() }), /Reopen the project/);
  assert.deepEqual(complete, before);
  const reopened = changeProject(complete, p(complete).id, { status: 'active' }, p(complete).updatedAt, now);
  const created = run(reopened, { type: 'create', phases: phases() });
  assert.equal(p(created).status, 'active');
  assert.deepEqual(p(created).plan!.phases.map(p => p.state), ['upcoming', 'upcoming', 'upcoming']);
  assert.doesNotThrow(() => validateSnapshot(created));
});

test('cloud completion between initial plan review and confirmation rejects creation without overwriting', async () => {
  const data = planFixture(); delete p(data).plan; data.tasks = [];
  const repository = createRepository(memory(data)); const local = await repository.loadAppData();
  const token = planToken(local, p(local));
  const draft: PlanCommand = { type: 'create', phases: phases() };
  assert.ok(previewPlanCommand(local, p(local).id, token, draft).projects[0].plan);
  const complete = changeProject(local, p(local).id, { status: 'complete' }, p(local).updatedAt, now);
  const accepted = await repository.applyCloudData(complete, fingerprint(local));
  await assert.rejects(repository.changeAppData(current => applyPlanCommand(current, p(local).id, token, draft)), /Reopen the project/);
  assert.deepEqual(await repository.loadAppData(), accepted);
  assert.deepEqual(draft.phases, phases());
});

test('ordinary project lifecycle stays unchanged; draft creation and assignment preserve dates and status', () => {
  const data = planFixture(); delete p(data).plan;
  const complete = changeProject(data, p(data).id, { status: 'complete' }, p(data).updatedAt, now);
  assert.equal(p(complete).status, 'complete');
  const base = { ...data, tasks: data.tasks.map(t => ({ ...t, phaseId: undefined })) };
  const created = run(base, { type: 'create', phases: phases() });
  assert.equal(p(created).status, 'active'); assert.equal(p(created).plan!.started, false);
  const assigned = run(created, { type: 'assign', taskIds: created.tasks.map(t => t.id), phaseId: 'phase-1' });
  assert.equal(assigned.tasks.length, 33); assert.ok(assigned.tasks.every(t => t.phaseId === 'phase-1' && !t.dueDate));
  const started = run(assigned, { type: 'start' }); assert.deepEqual(p(started).plan!.phases.map(p => p.state), ['current', 'upcoming', 'upcoming']);
});
test('task milestones derive completion, manual milestones wait, and history survives reopen', () => {
  let data = run(planFixture(), { type: 'milestone', milestone: milestone(), action: 'none' });
  data = done(data, 'work-0'); assert.equal(milestoneState(data.tasks, p(data).plan!.milestones[0]).complete, false);
  data = done(data, 'work-1'); assert.equal(milestoneState(data.tasks, p(data).plan!.milestones[0]).complete, true);
  assert.equal(p(data).plan!.milestones[0].history[0].action, 'complete');
  data = run(data, { type: 'milestone', milestone: milestone({ type: 'approval' }), action: 'none' });
  assert.equal(milestoneState(data.tasks, p(data).plan!.milestones[0]).label, 'Ready for approval');
  data = run(data, { type: 'approve', milestoneId: 'gate' }); assert.ok(p(data).plan!.milestones[0].approvedAt);
  data = reconcilePlans(data, changeTask(data, 'work-0', { status: 'backlog' }), now);
  assert.equal(milestoneState(data.tasks, p(data).plan!.milestones[0]).label, 'Needs attention');
  assert.equal(p(data).plan!.milestones[0].history.at(-1)!.action, 'invalidate');
  assert.ok(p(data).plan!.milestones[0].history.some(h => h.action === 'approve'));
});
test('trigger waits for every other requirement; optional unfinished work is preserved', () => {
  let data = run(planFixture(), { type: 'milestone', milestone: milestone(), action: 'phase' });
  data = run(data, { type: 'start' }); data = done(done(data, 'work-0'), 'work-1');
  assert.equal(p(data).plan!.phases[0].state, 'current');
  data = finishPhaseTasks(data, 0);
  assert.equal(p(data).plan!.phases[1].state, 'current');
  assert.equal(data.tasks.find(t => t.id === 'work-10')!.status, 'backlog');
});
test('early future completion does not skip current; bounded cascades stop at manual, empty and final confirmation', () => {
  let data = run(planFixture(), { type: 'start' }); data = finishPhaseTasks(data, 1);
  assert.equal(p(data).plan!.phases[0].state, 'current');
  data = run(data, { type: 'phase', phase: { ...p(data).plan!.phases[1], rule: { mode: 'required' } } });
  data = finishPhaseTasks(data, 0); data = run(data, { type: 'advance' });
  assert.deepEqual(p(data).plan!.phases.map(p => p.state), ['complete', 'complete', 'current']);
  data = finishPhaseTasks(data, 2); assert.equal(p(data).status, 'active');
  data = run(data, { type: 'finish' }); assert.equal(p(data).status, 'complete');
  const empty = planFixture(); empty.tasks = []; p(empty).plan!.phases.forEach(p => { p.rule.mode = 'required'; }); p(empty).plan!.automaticCompletion = true;
  assert.equal(p(run(empty, { type: 'start' })).plan!.phases[0].state, 'current');
});
test('explicit auto final completion occurs once, uses stable identities, and required unassigned work blocks it', () => {
  let data = planFixture(); p(data).plan!.phases.forEach(p => { p.rule.mode = 'required'; }); p(data).plan!.automaticCompletion = true;
  data.tasks.push({ ...createTask({ title: 'Loose requirement', sectionId: 'work', projectId: 'planned' }, now), id: 'loose' });
  data = run(data, { type: 'start' }); for (let i = 0; i < 3; i++) data = finishPhaseTasks(data, i);
  assert.equal(p(data).status, 'active'); assert.ok(projectBlockers(data, p(data)).some(b => b.includes('Loose')));
  const a = done(data, 'loose'), b = done(data, 'loose');
  assert.equal(p(a).status, 'complete'); assert.deepEqual(p(a).plan!.history.map(t => t.id), p(b).plan!.history.map(t => t.id));
  assert.equal(p(a).plan!.history.filter(t => !t.phaseId && t.to === 'complete').length, 1);
  assert.deepEqual(reconcilePlans(a, a), a);
});
test('reopen flags completed work, explicit earlier reopen retains later task completion and one current phase', () => {
  let data = run(planFixture(), { type: 'start' });
  for (let i = 0; i < 3; i++) { data = finishPhaseTasks(data, i); data = run(data, { type: i === 2 ? 'finish' : 'advance' }); }
  const history = p(data).plan!.history.length;
  data = reconcilePlans(data, changeTask(data, 'work-0', { status: 'backlog' }), now);
  assert.equal(p(data).status, 'complete'); assert.ok(planNotices(data, p(data)).some(n => n.includes('unfinished')));
  data = run(data, { type: 'reopen', phaseId: 'phase-0' });
  assert.equal(p(data).status, 'active'); assert.deepEqual(p(data).plan!.phases.map(p => p.state), ['current', 'upcoming', 'upcoming']);
  assert.equal(data.tasks.find(t => t.id === 'work-22')!.status, 'complete'); assert.ok(p(data).plan!.history.length > history);
});
test('deleting or moving linked work retains invalid references, and explicit repair invalidates prior approval', () => {
  let data = run(planFixture(), { type: 'milestone', milestone: milestone({ type: 'approval' }), action: 'none' });
  data = done(done(data, 'work-0'), 'work-1'); data = run(data, { type: 'approve', milestoneId: 'gate' });
  const moved = run(data, { type: 'assign', taskIds: ['work-0'], phaseId: 'phase-1' });
  assert.deepEqual(milestoneState(moved.tasks, p(moved).plan!.milestones[0]).invalid, ['work-0']);
  const deleted = reconcilePlans(data, deleteTask(data, 'work-0', data.tasks[0].updatedAt), now);
  assert.equal(p(deleted).plan!.milestones[0].taskIds.length, 2);
  assert.equal(validateSnapshot(deleted).data.projects[0].plan!.milestones[0].taskIds.length, 2);
  const repaired = run(data, { type: 'milestone', milestone: { ...p(data).plan!.milestones[0], taskIds: ['work-1'] }, action: 'none' });
  assert.equal(p(repaired).plan!.milestones[0].approvedAt, undefined); assert.ok(p(repaired).plan!.milestones[0].history.some(h => h.action === 'approve'));
});
test('already satisfied rule preview matches saving; stale task snapshots cannot advance or bulk move', () => {
  let data = run(planFixture(), { type: 'start' }); data = finishPhaseTasks(data, 0);
  const command: PlanCommand = { type: 'phase', phase: { ...p(data).plan!.phases[0], rule: { mode: 'required' } } };
  const preview = run(data, command); assert.equal(p(preview).plan!.phases[1].state, 'current');
  const token = planToken(data, p(data)); const changed = changeTask(data, 'work-0', { status: 'backlog' });
  assert.throws(() => applyPlanCommand(changed, 'planned', token, command), /changed/);
  assert.throws(() => applyPlanCommand(changed, 'planned', token, { type: 'assign', taskIds: ['work-0'], phaseId: 'phase-1' }), /changed/);
});
test('reordering only upcoming phases keeps assignments and current history; phase deletion moves tasks explicitly', () => {
  let data = run(planFixture(), { type: 'start' }); const assignments = data.tasks.map(t => t.phaseId);
  data = run(data, { type: 'reorder', phaseId: 'phase-2', direction: -1 }); assert.deepEqual(data.tasks.map(t => t.phaseId), assignments);
  assert.equal(p(data).plan!.phases[0].id, 'phase-0');
  assert.throws(() => run(data, { type: 'reorder', phaseId: 'phase-2', direction: -1 }), /upcoming/);
  data = run(data, { type: 'delete-phase', phaseId: 'phase-2', destination: 'phase-1', deleteMilestones: true });
  assert.equal(data.tasks.length, 33); assert.equal(data.tasks.filter(t => t.phaseId === 'phase-1').length, 22);
});
test('recurring maintenance excluded, optional finite progress retained, next task favors current or explicit choice', () => {
  let data = run(planFixture(), { type: 'start' }); const baseline = getProjectProgress(data.tasks, p(data));
  data.tasks.push({ ...data.tasks[0], id: 'routine', phaseId: undefined, recurrenceId: 'series', planRequired: true });
  assert.deepEqual(getProjectProgress(data.tasks, p(data)), baseline); assert.equal(phaseReadiness(data, p(data), p(data).plan!.phases[0]).total, 10);
  data.tasks.find(t => t.id === 'work-22')!.priority = 'high';
  assert.equal(getProjectNextTask(data.tasks, p(data), '2026-10-12').task!.phaseId, 'phase-0');
  assert.equal(getProjectNextTask(data.tasks, p(data), '2026-10-12', 'work-22').task!.id, 'work-22');
});
test('validation, legacy migration, export/recovery preserve states without executing satisfied rules', async () => {
  let data = run(planFixture(), { type: 'start' }); data = finishPhaseTasks(data, 0);
  p(data).plan!.phases[0].rule.mode = 'required'; // imported recorded state, intentionally not evaluated
  const canonical = validateSnapshot(data).data;
  assert.deepEqual(validateImport(JSON.stringify(createExport(data, now))).data, canonical);
  assert.deepEqual(migrateSnapshot(persistedSnapshot(data, 7)), canonical);
  const storage = memory(data), repo = createRepository(storage); assert.deepEqual(await repo.loadAppData(), canonical);
  await repo.importAppData(JSON.stringify(createExport(data, now))); assert.equal((await repo.loadAppData()).projects[0].plan!.phases[0].state, 'current');
  const backups = await repo.listRecoveryBackups(); assert.ok(backups.length);
  const raw = storage.values.get(backups[0].key)!; await repo.restoreRecoveryBackup(backups[0].key, raw);
  assert.equal((await repo.loadAppData()).projects[0].plan!.phases[0].state, 'current');
  const old = planFixture(); delete p(old).plan; old.tasks.forEach(t => { delete t.phaseId; delete t.planRequired; }); assert.equal(validateSnapshot(old).data.projects[0].plan, undefined);
  const bad = planFixture(); p(bad).plan!.phases[1].id = 'phase-0'; assert.throws(() => validateSnapshot(bad), /unique/);
});
test('repository transactions advance once, cloud acceptance uses latest local revision, undo never rewinds transitions', async () => {
  let data = run(planFixture(), { type: 'start' }); data = finishPhaseTasks(data, 0);
  data = changeTask(data, 'work-0', { status: 'backlog' }); p(data).plan!.phases[0].rule.mode = 'required';
  const storage = memory(data), repo = createRepository(storage); await repo.loadAppData();
  const updated = await repo.changeAppData(current => changeTask(current, 'work-0', { status: 'complete' }), 'Complete');
  assert.equal(p(updated).plan!.phases[1].state, 'current');
  const undo = await repo.undoAppData(repo.getUndo()!.id); assert.equal(p(undo).plan!.phases[1].state, 'current');
  assert.ok(planNotices(undo, p(undo)).some(n => n.includes('unfinished')));
  await assert.rejects(repo.applyCloudData(updated, fingerprint(data)), /changed/);
  const fresh = createRepository(memory(data)); await fresh.loadAppData(); const accepted = await fresh.applyCloudData(changeTask(data, 'work-0', { status: 'complete' }), fingerprint(validateSnapshot(data).data));
  assert.equal(p(accepted).plan!.phases[1].state, 'current');
});
test('merge retains local plans, never silently moves invalid assignments, and preserves milestone repair state', () => {
  const incoming = planFixture(), local = createDefaultAppData();
  const first = planMergeImport(local, JSON.stringify(createExport(incoming, now))); assert.equal(first.data.tasks.length, 33);
  assert.equal(first.data.projects[0].plan!.phases.length, 3);
  const existing = planFixture(); existing.tasks = []; p(existing).plan!.phases = [p(existing).plan!.phases[0]];
  const result = planMergeImport(existing, JSON.stringify(createExport(incoming, now)));
  assert.equal(result.data.tasks.length, 11); assert.ok(result.warnings.some(w => w.includes('phase')));
});
test('undo guards intervening edits and task assignment remains ordinary per-record undo', () => {
  const base = planFixture(), after = run(base, { type: 'assign', taskIds: ['work-0'], phaseId: 'phase-1' });
  const entry = taskUndo(base, after, 'Move')!; const restored = applyTaskUndo(after, entry); assert.equal(restored.tasks[0].phaseId, 'phase-0');
  assert.throws(() => applyTaskUndo(changeTask(after, 'work-0', { title: 'Changed' }), entry), /changed/);
});

test('cloud CAS reconciles equal gate completions once and refuses conflicting offline requirements', async () => {
  let base = run(planFixture(), { type: 'start' }); base = finishPhaseTasks(base, 0);
  base = changeTask(base, 'work-0', { status: 'backlog' }, undefined, undefined, now); p(base).plan!.phases[0].rule.mode = 'required';
  const first = validateSnapshot(done(base, 'work-0')).data, second = validateSnapshot(done(base, 'work-0')).data;
  assert.equal(fingerprint(first), fingerprint(second));
  let row: CloudSnapshot | undefined, writes = 0;
  const gateway = { userId: async () => 'synthetic-plans', read: async () => row ?? null, write: async (id: string, payload: ReturnType<typeof createExport>, revision: number) => {
    if (revision !== (row?.revision ?? 0)) throw new CloudConflictError();
    writes++; return row = { user_id: id, revision: revision + 1, schema_version: payload.schemaVersion, payload, updated_at: now.toISOString() };
  } };
  const a = createAutomaticSync(gateway, memory(base), 'synthetic-plans', async () => first, async () => { throw Error('Unexpected replacement'); });
  const b = createAutomaticSync(gateway, memory(base), 'synthetic-plans', async () => second, async () => { throw Error('Unexpected replacement'); });
  assert.equal((await a.run()).state, 'synced'); assert.equal((await b.run()).state, 'synced'); assert.equal(writes, 1);
  const changed = run(base, { type: 'phase', phase: { ...p(base).plan!.phases[0], name: 'New requirement review', rule: { mode: 'manual' } } });
  const stale = createAutomaticSync(gateway, memory(base), 'synthetic-plans', async () => changed, async () => { throw Error('Must not replace divergent requirements'); });
  assert.equal((await stale.run()).state, 'conflict'); assert.equal(writes, 1);
});
test('Calendar target markers and saved phase filters do not duplicate tasks or broaden deleted references', () => {
  let data = run(planFixture(), { type: 'milestone', milestone: milestone({ targetDate: '2026-10-12' }), action: 'none' });
  const dates = data.tasks.map(t => t.dueDate);
  const days = calendarDays(data, '2026-10-12', '2026-10-12'); assert.equal(days[0].milestones?.length, 1); assert.equal(days[0].events.length, 0); assert.equal(days[0].tasks.length, 0);
  assert.deepEqual(data.tasks.map(t => t.dueDate), dates);
  assert.equal(searchData(data, [], { query: '', phaseIds: ['phase-1'] }).tasks.length, 11);
  data = run(data, { type: 'delete-phase', phaseId: 'phase-1', deleteMilestones: true });
  assert.equal(searchData(data, [], { query: '', phaseIds: ['phase-1'] }).tasks.length, 0);
  const roundtrip = validateImport(JSON.stringify(createExport({ ...data, savedViews: [{ id: 'v', name: 'Missing phase', query: '', phaseIds: ['phase-1'] }] }))).data;
  assert.equal(searchData(roundtrip, [], roundtrip.savedViews![0]).tasks.length, 0);
});
test('reminders retain task identity through assignment and transitions; milestone targets never schedule notifications', () => {
  let data = planFixture(); data.tasks[10] = { ...data.tasks[10], dueDate: '2026-10-13', reminderEnabled: true, reminderAt: '2026-10-13T15:00:00Z' };
  data = run(data, { type: 'milestone', milestone: milestone({ targetDate: '2026-10-13' }), action: 'none' });
  const prefs = { enabled: true, respectQuietHours: true }, expected = notificationPlan(data, prefs, 'granted', now);
  assert.equal(expected.length, 1);
  data = run(data, { type: 'assign', taskIds: ['work-10'], phaseId: 'phase-1', required: false });
  assert.deepEqual(notificationPlan(data, prefs, 'granted', now), expected);
  data = run(data, { type: 'start' }); data = finishPhaseTasks(data, 0); data = run(data, { type: 'advance' });
  assert.deepEqual(notificationPlan(data, prefs, 'granted', now), expected);
  data = done(data, 'work-10'); assert.equal(notificationPlan(data, prefs, 'granted', now).length, 0);
});
test('account repositories, presentation expansion and Focus pins remain isolated across retries and reloads', async () => {
  const storage = memory(createDefaultAppData()), accountA = accountStorage(storage, 'plan-a'), accountB = accountStorage(storage, 'plan-b');
  const a = createRepository(accountA), b = createRepository(accountB);
  await a.loadAppData(); await b.loadAppData(); await a.importAppData(JSON.stringify(createExport(planFixture())));
  assert.equal((await b.loadAppData()).projects.length, 0);
  const key = 'lifecommand:device:presentation:v1';
  await accountA.setItem(key, JSON.stringify({ collapsed: { 'Plan:phase:planned:phase-0': false }, focusDate: '2026-10-12', focusTaskIds: ['work-0'] }));
  assert.equal(await accountB.getItem(key), null);
  const before = normalizePresentation(JSON.parse((await accountA.getItem(key))!));
  await a.changeAppData(current => applyPlanCommand(current, 'planned', planToken(current, p(current)), { type: 'start' }, now));
  assert.deepEqual(normalizePresentation(JSON.parse((await accountA.getItem(key))!)), before);
  assert.equal((await createRepository(accountA).loadAppData()).projects[0].plan!.phases[0].state, 'current');
});
test('periodic rollover and ordinary title/schedule edits never replay imported ready transitions', () => {
  let data = run(planFixture(), { type: 'start' }); data = finishPhaseTasks(data, 0); p(data).plan!.phases[0].rule.mode = 'required';
  data.tasks[20].dueDate = '2026-10-10'; data.tasks[20].status = 'scheduled';
  const rolled = reconcilePlans(data, rolloverAppData(data, now));
  assert.equal(p(rolled).plan!.phases[0].state, 'current'); assert.notEqual(rolled.tasks[20].dueDate, data.tasks[20].dueDate);
  const edited = reconcilePlans(rolled, changeTask(rolled, 'work-20', { title: 'Edited detail' }));
  assert.equal(p(edited).plan!.phases[0].state, 'current');
});
test('Undo of supporting-task completion invalidates approval without undoing phase history', () => {
  let data = run(planFixture(), { type: 'milestone', milestone: milestone({ type: 'approval', taskIds: ['work-0'] }), action: 'none' });
  const completed = done(data, 'work-0'), undo = taskUndo(data, completed, 'Complete')!;
  data = run(completed, { type: 'approve', milestoneId: 'gate' });
  const restored = applyTaskUndo(data, undo);
  assert.equal(p(restored).plan!.milestones[0].approvedAt, undefined);
  assert.ok(p(restored).plan!.milestones[0].history.some(h => h.action === 'approve'));
  assert.equal(milestoneState(restored.tasks, p(restored).plan!.milestones[0]).label, 'Needs attention');
});
test('create draft then start uses the same stale token before and after normalized storage ordering', async () => {
  const base = planFixture(); delete p(base).plan; base.tasks = [];
  const repository = createRepository(memory(base)); await repository.loadAppData();
  const created = await repository.changeAppData(current => applyPlanCommand(current, p(current).id, planToken(current, p(current)), { type: 'create', phases: phases() }, now));
  const saved = await repository.loadAppData();
  assert.equal(planToken(created, p(created)), planToken(saved, p(saved)));
  const started = await repository.changeAppData(current => applyPlanCommand(current, p(created).id, planToken(created, p(created)), { type: 'start' }, now));
  assert.equal(p(started).plan!.phases[0].state, 'current');
});
test('deleting a current or completed phase preserves tasks and audit, and explicitly chooses the next current phase', () => {
  let data = run(planFixture(), { type: 'start' }); data = finishPhaseTasks(data, 0); data = run(data, { type: 'advance' });
  const oldTaskStates = data.tasks.map(t => t.status);
  data = run(data, { type: 'delete-phase', phaseId: 'phase-1', destination: 'phase-2', deleteMilestones: true });
  assert.equal(p(data).plan!.phases.find(phase => phase.state === 'current')!.id, 'phase-2');
  assert.deepEqual(data.tasks.map(t => t.status), oldTaskStates);
  assert.ok(p(data).plan!.history.some(t => t.phaseId === 'phase-1' && t.phaseName === 'Build' && t.to === 'archived'));
  data = run(data, { type: 'delete-phase', phaseId: 'phase-2', deleteMilestones: true });
  assert.equal(p(data).plan!.phases[0].state, 'current'); // no following phase: revisit prior complete phase
  assert.equal(data.tasks.length, 33);
});
test('assignment consequence tokens reject an intervening requirement edit in either project', () => {
  const data = planFixture(), token = planToken(data, p(data));
  const updated = changeTask(data, 'work-1', { planRequired: false });
  assert.throws(() => assertPlanTokens(updated, { planned: token }), /requirements changed/);
  assert.doesNotThrow(() => assertPlanTokens(validateSnapshot(data).data, { planned: token }));
});
test('invalid stored plans fail recoverably without repair, writes, or lost task records', async () => {
  const data = planFixture(), storage = memory(data);
  const raw = JSON.parse(storage.values.get(STORAGE_KEY)!); raw.projects[0].plan.phases[0].rule.mode = 'skip-everything';
  const damaged = JSON.stringify(raw); storage.values.set(STORAGE_KEY, damaged);
  await assert.rejects(createRepository(storage).loadAppData(), /progression rule/);
  assert.equal(storage.values.get(STORAGE_KEY), damaged); assert.equal(storage.values.size, 1);
  const repository = createRepository(memory(data)); await repository.loadAppData();
  const envelope = createExport(data); (envelope.data.projects[0].plan!.phases[0].rule as { mode: string }).mode = 'invalid';
  await assert.rejects(repository.importAppData(JSON.stringify(envelope)), /progression rule/);
  assert.equal((await repository.loadAppData()).tasks.length, 33);
});
test('finite-to-recurring conversion leaves explicit milestone repair and bounded maintenance never inflates gates', () => {
  let data = run(planFixture(), { type: 'milestone', milestone: milestone(), action: 'none' });
  const series: RecurringSeries = { id: 'maintenance', title: 'Regular inspection', projectId: 'planned', sectionId: 'work', priority: 'normal', storyPoints: 1, startDate: '2026-10-12', timeZone: 'America/New_York', frequency: 'daily', weekdays: [], monthEnd: 'last-day', createdAt: now.toISOString(), updatedAt: now.toISOString() };
  data = reconcilePlans(data, convertTaskToSeries(data, data.tasks[0], series, now), now);
  assert.equal(milestoneState(data.tasks, p(data).plan!.milestones[0]).label, 'Needs attention');
  assert.ok(data.tasks.filter(t => t.recurrenceId).every(t => !t.phaseId));
  const progress = getProjectProgress(data.tasks, p(data)), gate = phaseReadiness(data, p(data), p(data).plan!.phases[0]);
  const later = materializeRecurrences(data, new Date('2027-01-12T12:00:00Z'), 30);
  assert.deepEqual(getProjectProgress(later.tasks, p(later)), progress); assert.equal(phaseReadiness(later, p(later), p(later).plan!.phases[0]).total, gate.total);
  assert.doesNotThrow(() => validateSnapshot(later));
});

test('next milestone follows phase order into upcoming work when current milestones are complete', () => {
  let data = run(planFixture(), { type: 'start' });
  data = run(data, { type: 'milestone', milestone: milestone({ id: 'future', phaseId: 'phase-2', taskIds: [], type: 'approval' }), action: 'none' });
  data = run(data, { type: 'milestone', milestone: milestone(), action: 'none' });
  assert.equal(nextMilestone(data.tasks, p(data))!.id, 'gate');
  data = done(done(data, 'work-0'), 'work-1');
  assert.equal(nextMilestone(data.tasks, p(data))!.id, 'future');
});


test('foreground recurring maintenance cannot replay imported ready phase transitions', async () => {
  let imported = run(planFixture(), { type: 'start' });
  imported = finishPhaseTasks(imported, 0);
  p(imported).plan!.phases[0].rule.mode = 'required'; // preserve this recorded import state
  imported.recurringSeries = [{ id: 'imported-maintenance', title: 'Daily maintenance', projectId: 'planned', sectionId: 'work', priority: 'normal', storyPoints: 1, startDate: '2026-10-12', timeZone: 'UTC', frequency: 'daily', weekdays: [], monthEnd: 'last-day', createdAt: now.toISOString(), updatedAt: now.toISOString() }];
  const repository = createRepository(memory(createDefaultAppData()));
  await repository.loadAppData();
  await repository.importAppData(JSON.stringify(createExport(imported, now)));
  const retained = (await repository.loadAppData()).projects[0].plan!;
  const generated = await repository.changeAppData(current => materializeRecurrences(current, now, 30));
  assert.equal(generated.tasks.filter(t => t.recurrenceId).length, 31);
  assert.deepEqual(p(generated).plan, retained, 'foreground maintenance must retain imported phase state and history');
  const occurrence = generated.tasks.find(t => t.recurrenceId)!;
  const completed = await repository.changeAppData(current => changeTask(current, occurrence.id, { status: 'complete' }, undefined, occurrence.updatedAt, now));
  assert.deepEqual(p(completed).plan, retained, 'maintenance completion is outside finite plan gates');
  assert.deepEqual(p(await repository.loadAppData()).plan, retained);
  const reopened = await repository.changeAppData(current => changeTask(current, 'work-0', { status: 'backlog' }, undefined, undefined, now));
  assert.equal(p(reopened).plan!.phases[0].state, 'current');
  const advanced = await repository.changeAppData(current => changeTask(current, 'work-0', { status: 'complete' }, undefined, undefined, now));
  assert.deepEqual(p(advanced).plan!.phases.map(phase => phase.state), ['complete', 'current', 'upcoming']);
  assert.equal(p(advanced).plan!.history.length, retained.history.length + 2, 'finite work still advances exactly once');
});
