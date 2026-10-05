import type { AppData, Section } from './models';

// Color is always accompanied by the section name; swatches are never text backgrounds.
export const sectionColors = [
  ['Blue', '#3978C5'], ['Teal', '#16817E'], ['Gold', '#A47516'],
  ['Purple', '#8066B2'], ['Orange', '#B96527'], ['Rose', '#B55078'], ['Green', '#398052'],
] as const;
export const activeSections = (sections: Section[]) => sections.filter(s => !s.archived).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

export function saveSection(data: AppData, section: Section, expected?: Section): AppData {
  const current = data.sections.find(s => s.id === section.id);
  if (JSON.stringify(current) !== JSON.stringify(expected)) throw Error('This section changed. Reload Settings before saving.');
  const name = section.name.trim();
  if (!name || name.length > 60) throw Error('Use a section name between 1 and 60 characters.');
  if (!/^#[\da-f]{6}$/i.test(section.color)) throw Error('Choose a valid section color.');
  if (!Number.isSafeInteger(section.order) || section.order < 0) throw Error('Invalid section order.');
  if (data.sections.some(s => s.id !== section.id && s.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw Error('A section already has this name.');
  if (section.archived && !data.sections.some(s => s.id !== section.id && !s.archived)) throw Error('Keep at least one active section.');
  return { ...data, sections: current ? data.sections.map(s => s.id === section.id ? { ...section, name } : s) : [...data.sections, { ...section, name }] };
}

export function moveSection(data: AppData, id: string, direction: -1 | 1): AppData {
  const sections = [...data.sections].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const index = sections.findIndex(s => s.id === id), other = index + direction;
  if (index < 0 || other < 0 || other >= sections.length) return data;
  [sections[index], sections[other]] = [sections[other], sections[index]];
  return { ...data, sections: sections.map((s, order) => ({ ...s, order })) };
}

export function reassignSection(data: AppData, source: string, target: string): AppData {
  if (source === target || !data.sections.some(s => s.id === source) || !data.sections.some(s => s.id === target && !s.archived)) throw Error('Choose a different active section.');
  const stamp = (previous: string) => new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
  return { ...data,
    ...(data.recurringSeries ? { recurringSeries: data.recurringSeries.map(s => s.sectionId === source ? { ...s, sectionId: target, updatedAt: stamp(s.updatedAt) } : s) } : {}),
    tasks: data.tasks.map(t => t.sectionId === source ? { ...t, sectionId: target, updatedAt: stamp(t.updatedAt) } : t),
    projects: data.projects.map(p => p.sectionId === source ? { ...p, sectionId: target, updatedAt: stamp(p.updatedAt) } : p),
  };
}
