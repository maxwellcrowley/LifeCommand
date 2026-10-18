import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultAppData } from '../src/domain/defaults';
import { createProject } from '../src/domain/projects';
import { draftPlan, previewPlanCommand, transitionSummary } from '../src/domain/projectPlans';
import { planToken } from '../src/domain/planState';

test('saved phase reordering describes resulting positions without inventing lifecycle transitions', () => {
  const before = createDefaultAppData();
  const project = createProject({ name: 'Acceptance plan', sectionId: 'home' });
  project.plan = draftPlan(['First', 'Second', 'Third'].map((name, i) => ({ id: `p${i}`, name, state: 'upcoming', rule: { mode: 'manual' } })));
  before.projects = [project];
  const after = previewPlanCommand(before, project.id, planToken(before, project), { type: 'reorder', phaseId: 'p1', direction: 1 });
  assert.equal(transitionSummary(before, after), 'Acceptance plan: phase order saved. First: position 1 of 3; Third: position 2 of 3; Second: position 3 of 3');
  assert.deepEqual(after.projects[0].plan!.history, before.projects[0].plan!.history);
  assert.equal(transitionSummary(after, after), '');
  const renamed = structuredClone(after); renamed.projects[0].plan!.phases[0].name = 'Renamed';
  assert.equal(transitionSummary(after, renamed), '');
  const started = previewPlanCommand(after, project.id, planToken(after, after.projects[0]), { type: 'start' });
  assert.throws(() => previewPlanCommand(started, project.id, planToken(started, started.projects[0]), { type: 'reorder', phaseId: 'p2', direction: -1 }));
  assert.match(transitionSummary(after, started), /is now current/);
});
