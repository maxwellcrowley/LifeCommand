// Isolated records only. Used by the disposable browser workflow.
exports.fixture = () => {
  const { createDefaultAppData } = require('../.test-build/src/domain/defaults.js');
  const { createProject } = require('../.test-build/src/domain/projects.js');
  const { createTask } = require('../.test-build/src/domain/tasks.js');
  const { draftPlan } = require('../.test-build/src/domain/projectPlans.js');
  const { localDateKey } = require('../.test-build/src/domain/dates.js');
  const data = createDefaultAppData(), today = localDateKey(new Date()), stamp = new Date().toISOString();
  data.settings.autoRollover = false; data.settings.ambientDisplayEnabled = true; data.onboardingComplete = true;
  const project = { ...createProject({ name: 'Garden studio', description: 'A quiet place to build and make.', sectionId: 'home' }), id: 'plan-garden', plan: draftPlan(['Discover', 'Build', 'Launch'].map((name, i) => ({ id: `garden-${i}`, name, description: i === 0 ? 'Agree on the essentials before building.' : undefined, state: i === 0 ? 'current' : 'upcoming', rule: { mode: 'manual' } }))) };
  project.plan.started = true;
  const names = ['Measure the space', 'Confirm the design', 'Collect inspiration'];
  data.tasks = Array.from({ length: 33 }, (_, i) => ({ ...createTask({ title: names[i] ?? (i < 28 ? `Build detail ${i - 2}` : `Launch check ${i - 27}`), sectionId: 'home', projectId: project.id, phaseId: `garden-${i < 3 ? 0 : i < 28 ? 1 : 2}`, dueDate: i === 1 ? today : undefined, planRequired: i !== 2 && i !== 30, priority: i === 1 ? 'high' : 'normal' }), id: `garden-task-${i}`, ...(i === 0 ? { status: 'complete', completedAt: stamp } : {}) }));
  project.plan.milestones = [
    { id: 'design-gate', title: 'Design ready', projectId: project.id, phaseId: 'garden-0', type: 'tasks', required: true, taskIds: ['garden-task-0', 'garden-task-1'], targetDate: today, history: [] },
    { id: 'design-approval', title: 'Approve the design', projectId: project.id, phaseId: 'garden-0', type: 'approval', required: true, taskIds: ['garden-task-1'], history: [] },
    { id: 'handover', title: 'Studio handover', projectId: project.id, phaseId: 'garden-2', type: 'approval', required: true, taskIds: [], history: [] },
  ];
  data.projects = [project, { ...createProject({ name: 'Weekend reading', sectionId: 'personal' }), id: 'ordinary-project' }];
  data.tasks.push({ ...createTask({ title: 'Unassigned materials budget', sectionId: 'home', projectId: project.id }), id: 'garden-loose' });
  return { data, today };
};
