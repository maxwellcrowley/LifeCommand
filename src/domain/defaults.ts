import type { AppData, Section, SectionName } from './models';
import { defaultSettings } from './settings';

const names: SectionName[] = ['Work', 'Army', 'Family', 'Home', 'Health', 'Finance', 'Projects', 'Personal', 'Pets/Fosters'];
const colors = ['#3978C5', '#C7952D', '#31A3A0', '#D78343', '#5E9C70', '#8066B2', '#5474A5', '#5A9A75', '#C36D8E'];
export const sections: Section[] = names.map((name, order) => ({ id: name.toLowerCase().replaceAll('/', '-'), name, color: colors[order], order }));

// Fresh objects on every call; defaults never depend on demonstration records.
export function createDefaultAppData(): AppData {
  return {
    onboardingComplete: true,
    sections: sections.map(section => ({ ...section })),
    tasks: [], projects: [], calendarEvents: [], familyEvents: [],
    settings: { ...defaultSettings },
    lastRolloverSummary: undefined,
  };
}
