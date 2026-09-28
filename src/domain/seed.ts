import type { AppData, Section, SectionName } from './models';
import { localDateKey } from './dates';
import { defaultSettings } from './settings';
const today = new Date();
const day = (offset: number) => { const d = new Date(today); d.setDate(d.getDate() + offset); return localDateKey(d); };
const names: SectionName[] = ['Work', 'Army', 'Family', 'Home', 'Health', 'Finance', 'Projects', 'Personal', 'Pets/Fosters'];
const colors = ['#3978C5', '#C7952D', '#31A3A0', '#D78343', '#5E9C70', '#8066B2', '#5474A5', '#5A9A75', '#C36D8E'];
export const sections: Section[] = names.map((name, order) => ({ id: name.toLowerCase().replaceAll('/', '-'), name, color: colors[order], order }));
const now = today.toISOString();
export const seedData: AppData = {
  sections,
  tasks: [
    { id: 't1', title: 'Send stakeholder follow-up', sectionId: 'work', status: 'scheduled', priority: 'high', dueDate: day(0), owner: 'me', storyPoints: 2, rolloverCount: 0, manuallyDeferredCount: 0, createdAt: now, updatedAt: now },
    { id: 't2', title: 'Review training notes', sectionId: 'army', status: 'scheduled', priority: 'normal', dueDate: day(0), owner: 'me', storyPoints: 3, rolloverCount: 0, manuallyDeferredCount: 0, createdAt: now, updatedAt: now },
    { id: 't3', title: 'Book Isa’s checkup', sectionId: 'family', status: 'scheduled', priority: 'high', dueDate: day(-1), originalDueDate: day(-1), owner: 'shared', storyPoints: 1, rolloverCount: 1, manuallyDeferredCount: 0, createdAt: now, updatedAt: now },
    { id: 't4', title: 'Water the garden', sectionId: 'home', status: 'backlog', priority: 'low', owner: 'me', storyPoints: 1, rolloverCount: 0, manuallyDeferredCount: 0, createdAt: now, updatedAt: now },
    { id: 't5', title: 'Ship navigation shell', sectionId: 'projects', projectId: 'p1', status: 'complete', priority: 'high', dueDate: day(0), completedAt: now, owner: 'me', storyPoints: 3, rolloverCount: 0, manuallyDeferredCount: 0, createdAt: now, updatedAt: now },
    { id: 't6', title: 'Define task storage model', sectionId: 'projects', projectId: 'p1', status: 'scheduled', priority: 'normal', dueDate: day(1), owner: 'me', storyPoints: 5, rolloverCount: 0, manuallyDeferredCount: 0, createdAt: now, updatedAt: now },
    { id: 't7', title: 'Draft calendar agenda', sectionId: 'projects', projectId: 'p1', status: 'backlog', priority: 'normal', owner: 'me', storyPoints: 8, rolloverCount: 0, manuallyDeferredCount: 0, createdAt: now, updatedAt: now },
  ],
  projects: [{ id: 'p1', name: 'LifeCommand', description: 'A calm command center for daily life.', sectionId: 'projects', status: 'active', trackCompletion: true, useWeightedProgress: true, defaultTaskPoints: 1, includeBacklogTasks: true, createdAt: now, updatedAt: now }],
  calendarEvents: [
    { id: 'e1', title: 'Staff sync', date: day(0), startTime: '10:00', endTime: '10:30', source: 'work' },
    { id: 'e2', title: 'ACFT prep', date: day(0), startTime: '16:00', source: 'army' },
    { id: 'e3', title: 'Focus block', date: day(1), startTime: '09:00', source: 'personal' },
  ],
  familyEvents: [{ id: 'f1', title: 'Isa school pickup', date: day(0), startTime: '15:00', addedBy: 'Kellyn', category: 'School', color: '#31A3A0' }],
  settings: { ...defaultSettings },
};
