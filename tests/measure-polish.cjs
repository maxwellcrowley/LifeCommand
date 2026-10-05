// Synthetic, in-memory benchmark; run after npm test. No device storage or network.
const { performance } = require('node:perf_hooks');
const { createDefaultAppData } = require('../.test-build/src/domain/defaults');
const { createTask, scheduleTasks, groupTasksBySectionAndProject } = require('../.test-build/src/domain/tasks');
const { searchData } = require('../.test-build/src/domain/search');
const { calendarDays, createEvent } = require('../.test-build/src/domain/events');
const { writeFileSync } = require('node:fs');
const data = createDefaultAppData();
data.tasks = Array.from({ length: 10000 }, (_, i) => ({ ...createTask({ title: `Fixture ${i}`, sectionId: i % 2 ? 'home' : 'work', dueDate: i < 30 ? '2026-10-05' : undefined }), id: `fixture-${i}` }));
data.calendarEvents = Array.from({ length: 1000 }, (_, i) => createEvent({ title: `Event ${i}`, date: `2026-10-${String(1 + i % 28).padStart(2, '0')}`, source: 'personal', startTime: '12:00', endTime: '13:00' }));
const results = {};
for (const [name, operation] of Object.entries({
  'bulk schedule 2000 of 10000': () => scheduleTasks(data, data.tasks.slice(0,2000), '2026-10-05'),
  'group 10000': () => groupTasksBySectionAndProject(data, data.tasks),
  'search 10000 tasks and 1000 events': () => searchData(data, data.calendarEvents, { query: 'fixture 999' }),
  'calendar 30 days / 1000 events': () => calendarDays(data, '2026-10-01', '2026-10-30'),
})) {
  operation();
  const samples = Array.from({ length: 15 }, () => { const start = performance.now(); operation(); return performance.now() - start; }).sort((a,b)=>a-b);
  results[name] = { medianMs: +samples[7].toFixed(2), p95Ms: +samples[14].toFixed(2) };
}
console.log(JSON.stringify(results,null,2));
writeFileSync('.test-build/polish-performance.json',JSON.stringify(results,null,2));
