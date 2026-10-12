import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultAppData } from '../src/domain/defaults';
import { createProject, getProjectNextTask } from '../src/domain/projects';
import { createTask, scheduleTasks, updateTask, updateTaskSchedule } from '../src/domain/tasks';
import { rolloverAppData } from '../src/domain/rollover';
import { normalizePresentation, presentationDefaults } from '../src/domain/presentation';
import { classifyReview } from '../src/domain/review';
import { activeFocus } from '../src/domain/focus';
import { searchData } from '../src/domain/search';
import { mutateSavedView, validateSavedView, viewDateMatches, viewProblems } from '../src/domain/savedViews';
import { createExport, validateImport, validateSnapshot } from '../src/domain/transfer';
import { sectionAppearance, contrastRatio } from '../src/domain/sectionAppearance';
import { palettes } from '../src/theme/palettes';
import { accountStorage } from '../src/data/accountStorage';
import { createRepository, type SnapshotStorage } from '../src/data/storage';
const now = new Date('2026-10-10T12:00:00'), today = '2026-10-10';
function fixture() {
  const data = createDefaultAppData();
  data.settings.autoRollover = false;
  data.projects = [createProject({ name: 'Garden', sectionId: 'home' }, now), createProject({ name: 'Release', sectionId: 'work' }, now)];
  data.tasks = Array.from({ length: 36 }, (_, i) => ({ ...createTask({ title: `Task ${i}`, sectionId: i % 2 ? 'home' : 'work', projectId: data.projects[i % 2].id, priority: i % 3 ? 'normal' : 'high', dueDate: i < 12 ? today : undefined }, now), id: `synthetic-${i}` }));
  return data;
}
test('coordinated roles meet measured contrast for the full custom color matrix', () => {
  for (const theme of Object.values(palettes)) for (const color of ['#FF0000', '#FF8000', '#FFFF00', '#008000', '#008080', '#0000FF', '#800080', '#808080', '#FEFEFE', '#010101']) {
    const p = sectionAppearance(color, theme.surface, theme.text);
    for (const [foreground, background, minimum] of [[p.sectionForeground, p.background, 4.5], [p.icon, p.background, 4.5], [p.projectForeground, p.projectBackground, 4.5], [p.primaryForeground, p.primaryBackground, 4.5], [p.primaryForeground, p.pressedBackground, 4.5], [p.secondaryText, p.secondaryBackground, 4.5], [p.secondaryText, p.hoverBackground, 4.5], [p.disabledForeground, p.disabledBackground, 4.5], [p.projectBorder, p.projectBackground, 3], [p.focus, theme.surface, 3]] as const) assert.ok(contrastRatio(foreground, background) >= minimum, `${color} ${foreground}/${background}`);
    assert.equal(p.identity, color);
    if (color !== '#FEFEFE' || theme !== palettes.light) assert.notEqual(p.background, p.projectBackground);
  }
});
test('next-task date categories precede priority, ties are stable and explicit invalid choices fall back', () => {
  const data = fixture(), project = data.projects[0];
  const tasks = ['2026-10-08', '2026-10-09', today, undefined, '2026-10-11'].map((dueDate, i) => ({ ...data.tasks[0], id: `${i}`, projectId: project.id, dueDate, priority: i ? 'high' as const : 'low' as const }));
  assert.equal(getProjectNextTask(tasks.reverse(), project, today).task?.id, '0');
  assert.equal(getProjectNextTask(tasks, project, today, '4').kind, 'upcoming');
  for (const patch of [{ status: 'complete' as const }, { status: 'archived' as const }, { projectId: 'other' }]) assert.equal(getProjectNextTask(tasks.map(t => t.id === '4' ? { ...t, ...patch } : t), project, today, '4').task?.id, '0');
  assert.equal(getProjectNextTask(tasks, { ...project, status: 'archived' }, today).task, undefined);
});
test('manual postponements and rollovers are real separate actions and completion resets since-completion history', () => {
  const data = fixture(); let task = data.tasks[0];
  task = updateTaskSchedule(task, { dueDate: '2026-10-11' }, data.settings, 'clean', now);
  assert.equal(task.manualPostponementsSinceCompletion, 1);
  assert.equal(task.manuallyDeferredCount, 0);
  task = updateTaskSchedule(task, { dueDate: today }, data.settings, undefined, now);
  assert.equal(task.manualPostponementsSinceCompletion, 1);
  const rolled = rolloverAppData({ ...data, tasks: [task], settings: { ...data.settings, autoRollover: true, addRolloverCount: false } }, new Date('2026-10-11T12:00:00')).tasks[0];
  assert.equal(rolled.rolloversSinceCompletion, 1); assert.equal(rolled.rolloverCount, 0);
  const completed = updateTask(rolled, { status: 'complete' }, now);
  assert.equal(completed.manualPostponementsSinceCompletion, 0); assert.equal(completed.rolloversSinceCompletion, 0);
});
test('Review deduplicates by configured order, respects exclusions and never invents history', () => {
  const data = fixture(); data.tasks = [{ ...data.tasks[15], manualPostponementsSinceCompletion: 3 }, { ...data.tasks[14], manuallyDeferredCount: 99 }];
  const p = { ...presentationDefaults, reviewGroups: ['postponed', 'needs-date', 'projects'] as const };
  const result = classifyReview(data, today, { ...p, reviewGroups: [...p.reviewGroups] });
  assert.equal(result.entries[0].group, 'postponed'); assert.equal(result.entries[1].group, 'needs-date');
  assert.equal(result.entries[0].reasons.length, 2);
  assert.equal(classifyReview(data, today, { ...presentationDefaults, reviewBacklogExcludedSections: ['work'] }).entries[1].group, undefined);
  const future = classifyReview({ ...data, tasks: data.tasks.map(t => ({ ...t, dueDate: '2026-10-15' })) }, today, presentationDefaults);
  assert.ok(future.projects.every(p => p.reason.includes('Future-only')));
  assert.deepEqual(normalizePresentation({ reviewGroups: [] }).reviewGroups, []);
});
test('Focus is unique, ordered and date-bound; hiding it does not hide tasks', () => {
  const data = fixture(), p = normalizePresentation({ focusVisible: true, focusDate: today, focusTaskIds: ['synthetic-2', 'synthetic-0', 'synthetic-2'] });
  assert.deepEqual(activeFocus(data, p, today).map(t => t.id), ['synthetic-2', 'synthetic-0']);
  for (const patch of [{ status: 'complete' as const }, { status: 'archived' as const }, { dueDate: '2026-10-11' }]) assert.equal(activeFocus({ ...data, tasks: data.tasks.map(t => t.id === 'synthetic-2' ? { ...t, ...patch } : t) }, p, today).length, 1);
  assert.equal(activeFocus({ ...data, tasks: data.tasks.filter(t => t.id !== 'synthetic-2') }, p, today).length, 1);
  assert.equal(activeFocus(data, { ...p, focusVisible: false }, today).length, 0);
  assert.equal(activeFocus(data, p, '2026-10-11').length, 0);
  assert.equal(activeFocus(data, p, today).length + data.tasks.filter(t => t.dueDate === today && !p.focusTaskIds.includes(t.id)).length, 12);
});
test('saved multi-filters and dates round trip; missing references never broaden tasks or hide events', () => {
  const data = fixture();
  data.savedViews = [{ id: 'v', name: 'This week', query: '', sectionIds: ['home', 'work'], priorities: ['high'], dateMode: 'this-week', completion: 'open' }];
  const view = data.savedViews[0];
  assert.equal(searchData(data, [], view, today).tasks.length, 4);
  assert.deepEqual(validateImport(JSON.stringify(createExport(data))).data.savedViews, data.savedViews);
  assert.equal(viewDateMatches('2026-10-11', view, today), true);
  assert.equal(viewDateMatches('2026-10-11', view, '2026-10-12'), false);
  assert.equal(viewDateMatches(today, { query: '', dateMode: 'fixed', dateFrom: today, dateThrough: today }, '2027-01-01'), true);
  const bad = { ...view, sectionIds: ['deleted'] };
  assert.equal(viewProblems(data, bad).length, 1);
  const event = { id: 'event', source: 'personal' as const, title: 'Appointment', date: today };
  const result = searchData(data, [event], bad, today); assert.equal(result.tasks.length, 0); assert.equal(result.events.length, 1);
  assert.throws(() => validateSavedView({ ...view, dateMode: 'fixed', dateFrom: '2026-10-11', dateThrough: today }));
});
test('new optional history validates and older imports retain unknown history as absent', () => {
  const data = fixture(); data.tasks[0].manualPostponementsSinceCompletion = 3; data.tasks[0].rolloversSinceCompletion = 2;
  assert.deepEqual(validateImport(JSON.stringify(createExport(data))).data.tasks, JSON.parse(JSON.stringify(data.tasks)));
  assert.equal(validateImport(JSON.stringify(createExport(fixture()))).data.tasks[0].manualPostponementsSinceCompletion, undefined);
  assert.throws(() => validateSnapshot({ ...data, tasks: [{ ...data.tasks[0], manualPostponementsSinceCompletion: -1 }] }));
});
test('atomic planner revalidates project eligibility and leaves all tasks unchanged on a stale selection', () => {
  const data = fixture(), picks = data.tasks.slice(12, 15), before = structuredClone(data);
  data.projects[0].status = 'archived';
  assert.throws(() => scheduleTasks(data, picks, today, true, now), /Nothing was scheduled/);
  assert.deepEqual(data.tasks, before.tasks);
});
test('account-scoped views, Focus and planner preferences survive reload independently with retry', async () => {
  const values = new Map<string, string>(); let fail = false;
  const storage: SnapshotStorage = { getItem: async k => values.get(k) ?? null, setItem: async (k,v) => { if (fail) throw Error('Synthetic failure'); values.set(k,v); }, removeItem: async k => { values.delete(k); }, getAllKeys: async () => [...values.keys()] };
  const a = accountStorage(storage, 'A'), b = accountStorage(storage, 'B'), key = 'lifecommand:device:presentation:v1';
  const p = normalizePresentation({ focusVisible: true, focusDate: today, focusTaskIds: ['synthetic-1'], plannerSectionId: 'home', activeSavedViewId: 'v' });
  await a.setItem(key, JSON.stringify(p)); assert.equal(await b.getItem(key), null);
  assert.deepEqual(normalizePresentation(JSON.parse((await a.getItem(key))!)), p);
  const repo = createRepository(a); await repo.loadAppData();
  fail = true; await assert.rejects(repo.changeAppData(() => fixture())); fail = false;
  await repo.changeAppData(() => fixture()); assert.equal((await repo.loadAppData()).tasks.length, 36);
  assert.equal((await createRepository(b).loadAppData()).tasks.length, 0);
});
test('saved view updates/deletes reject stale editors and missing references without losing records', () => {
  const data = fixture(), view = { id: 'v', name: 'A', query: '' };
  const created = mutateSavedView(data, view.id, view, undefined);
  const changed = mutateSavedView(created, view.id, { ...view, name: 'B' }, view);
  assert.throws(() => mutateSavedView(changed, view.id, { ...view, name: 'C' }, view), /changed/);
  assert.throws(() => mutateSavedView(changed, view.id, undefined, view), /changed/);
  assert.throws(() => mutateSavedView(data, view.id, { ...view, sectionIds: ['missing'] }, undefined), /references/);
  assert.deepEqual(changed.tasks, data.tasks);
  assert.deepEqual(mutateSavedView(changed, view.id, undefined, changed.savedViews![0]).savedViews, []);
});

