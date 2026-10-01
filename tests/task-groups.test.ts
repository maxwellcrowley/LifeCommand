import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createDefaultAppData } from '../src/domain/defaults';
import { createProject, deleteProject } from '../src/domain/projects';
import { changeTask, createTask, deleteTask, getTodayTasks, groupTasksBySectionAndProject, isTaskOverdue, scheduleTasks } from '../src/domain/tasks';

const today = '2026-10-01';
function fixture() {
  const data = createDefaultAppData();
  const alpha = { ...createProject({ name: 'alpha' }), id: 'alpha' };
  const zulu = { ...createProject({ name: 'Zulu' }), id: 'zulu' };
  data.projects = [zulu, alpha];
  data.tasks = [
    createTask({ title: 'Zulu high', sectionId: 'work', projectId: zulu.id, priority: 'high', dueDate: today }),
    createTask({ title: 'Alpha low', sectionId: 'work', projectId: alpha.id, priority: 'low', dueDate: today }),
    createTask({ title: 'Unlinked high', sectionId: 'work', priority: 'high', dueDate: today }),
    createTask({ title: 'Alpha normal', sectionId: 'work', projectId: alpha.id, priority: 'normal', dueDate: today }),
    createTask({ title: 'Alpha high Z', sectionId: 'work', projectId: alpha.id, priority: 'high', dueDate: today }),
    createTask({ title: 'Alpha high A', sectionId: 'work', projectId: alpha.id, priority: 'high', dueDate: today }),
    createTask({ title: 'Home', sectionId: 'home', priority: 'high', dueDate: today }),
  ];
  return data;
}

test('Today groups saved sections, alphabetical projects, then priority/date/title without mutation', () => {
  const data = fixture();
  const before = structuredClone(data);
  const groups = groupTasksBySectionAndProject(data, getTodayTasks(data.tasks, today)).filter(group => group.tasks.length);
  assert.deepEqual(groups.map(group => group.section.id), ['work', 'home']);
  assert.deepEqual(groups[0].projectGroups.map(group => group.project?.name ?? 'No project'), ['alpha', 'Zulu', 'No project']);
  assert.deepEqual(groups[0].tasks.map(task => task.title), ['Alpha high A', 'Alpha high Z', 'Alpha normal', 'Alpha low', 'Zulu high', 'Unlinked high']);
  assert.deepEqual(groupTasksBySectionAndProject(data, [...data.tasks].reverse()), groupTasksBySectionAndProject(data, data.tasks));
  assert.deepEqual(data, before);
});

test('Review backlog, future, overdue and rolled-over selections share grouping', () => {
  const data = fixture();
  const expected = ['Alpha high A', 'Alpha high Z', 'Alpha normal', 'Alpha low', 'Zulu high', 'Unlinked high'];
  for (const dueDate of [undefined, '2026-10-02', '2026-09-30']) {
    data.tasks = data.tasks.map(task => ({ ...task, dueDate, status: dueDate ? 'scheduled' : 'backlog', rolloverCount: 1 }));
    const selected = data.tasks.filter(task => dueDate ? (dueDate > today ? task.dueDate! > today : isTaskOverdue(task, today)) : !task.dueDate);
    assert.deepEqual(groupTasksBySectionAndProject(data, selected)[0].tasks.map(task => task.title), expected);
    assert.deepEqual(groupTasksBySectionAndProject(data, data.tasks.filter(task => task.rolloverCount > 0))[0].tasks.map(task => task.title), expected);
  }
});

test('equal project names stay distinct, missing links and deleted projects join No project last', () => {
  let data = fixture();
  data.projects[0].name = 'ALPHA';
  data.tasks.push(createTask({ title: 'Missing project', sectionId: 'work', projectId: 'missing', dueDate: today }));
  let groups = groupTasksBySectionAndProject(data, data.tasks)[0].projectGroups;
  assert.deepEqual(groups.map(group => group.project?.id), ['alpha', 'zulu', undefined]);
  assert.deepEqual(groups[2].tasks.map(task => task.title), ['Unlinked high', 'Missing project']);
  data = deleteProject(data, 'alpha', data.projects[1].updatedAt);
  groups = groupTasksBySectionAndProject(data, data.tasks)[0].projectGroups;
  assert.deepEqual(groups.map(group => group.project?.id), ['zulu', undefined]);
  assert.equal(groups[1].tasks.length, 6);
});

test('section counts derive from completion, deletion and scheduling snapshots', () => {
  let data = fixture();
  const countToday = () => groupTasksBySectionAndProject(data, getTodayTasks(data.tasks, today))[0].tasks.length;
  assert.equal(countToday(), 6);
  data = changeTask(data, data.tasks[0].id, { status: 'complete' });
  assert.equal(countToday(), 5);
  data = deleteTask(data, data.tasks[1].id, data.tasks[1].updatedAt);
  assert.equal(countToday(), 4);
  const task = data.tasks.find(task => task.title === 'Unlinked high')!;
  data = scheduleTasks(data, [task], '2026-10-02');
  assert.equal(countToday(), 3);
  assert.equal(groupTasksBySectionAndProject(data, data.tasks.filter(task => task.dueDate! > today))[0].tasks.length, 1);
});
