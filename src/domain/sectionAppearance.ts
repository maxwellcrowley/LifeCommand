// Stable application IDs, independent of the platform's symbol names.
export const sectionIcons = [
  { id: 'default', label: 'General', ios: 'square.grid.2x2', material: 'grid_view', keywords: 'organization neutral default' },
  { id: 'home', label: 'Home', ios: 'house', material: 'home', keywords: 'house household' },
  { id: 'work', label: 'Work', ios: 'briefcase', material: 'work', keywords: 'office job business' },
  { id: 'family', label: 'Family', ios: 'person.2', material: 'groups', keywords: 'people children' },
  { id: 'health', label: 'Health', ios: 'heart', material: 'favorite', keywords: 'wellness medical' },
  { id: 'fitness', label: 'Fitness', ios: 'dumbbell', material: 'fitness_center', keywords: 'gym exercise weights' },
  { id: 'learning', label: 'Learning', ios: 'graduationcap', material: 'school', keywords: 'study education school' },
  { id: 'finance', label: 'Finances', ios: 'banknote', material: 'payments', keywords: 'money budget bills' },
  { id: 'shopping', label: 'Shopping', ios: 'cart', material: 'shopping_cart', keywords: 'groceries buy' },
  { id: 'chores', label: 'Chores', ios: 'sparkles', material: 'cleaning_services', keywords: 'cleaning housework' },
  { id: 'pets', label: 'Pets', ios: 'pawprint', material: 'pets', keywords: 'animals fosters dog cat' },
  { id: 'travel', label: 'Travel', ios: 'airplane', material: 'flight', keywords: 'trip vacation' },
  { id: 'hobbies', label: 'Hobbies', ios: 'paintpalette', material: 'palette', keywords: 'art creative craft' },
  { id: 'projects', label: 'Projects', ios: 'folder', material: 'folder', keywords: 'plans files' },
  { id: 'tasks', label: 'Tasks', ios: 'checklist', material: 'checklist', keywords: 'todo organization list' },
  { id: 'calendar', label: 'Calendar', ios: 'calendar', material: 'calendar_month', keywords: 'schedule appointments' },
  { id: 'garden', label: 'Garden', ios: 'leaf', material: 'eco', keywords: 'plants outdoors' },
  { id: 'food', label: 'Cooking', ios: 'fork.knife', material: 'restaurant', keywords: 'food meals kitchen' },
  { id: 'books', label: 'Reading', ios: 'book', material: 'menu_book', keywords: 'books library' },
  { id: 'music', label: 'Music', ios: 'music.note', material: 'music_note', keywords: 'instrument practice' },
  { id: 'games', label: 'Games', ios: 'gamecontroller', material: 'sports_esports', keywords: 'play leisure' },
  { id: 'car', label: 'Car', ios: 'car', material: 'directions_car', keywords: 'vehicle transport maintenance' },
  { id: 'tools', label: 'Repairs', ios: 'wrench.and.screwdriver', material: 'build', keywords: 'tools diy fix' },
  { id: 'mail', label: 'Mail', ios: 'envelope', material: 'mail', keywords: 'email messages correspondence' },
  { id: 'ideas', label: 'Ideas', ios: 'lightbulb', material: 'lightbulb', keywords: 'inspiration brainstorming' },
  { id: 'goals', label: 'Goals', ios: 'flag', material: 'flag', keywords: 'milestones targets' },
  { id: 'personal', label: 'Personal', ios: 'person', material: 'person', keywords: 'self individual' },
  { id: 'security', label: 'Security', ios: 'shield', material: 'shield', keywords: 'army protection safety' },
  { id: 'computer', label: 'Technology', ios: 'desktopcomputer', material: 'computer', keywords: 'computer software digital' },
  { id: 'inbox', label: 'Inbox', ios: 'tray', material: 'inbox', keywords: 'capture organization general' },
] as const;

export const isSectionIconId = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(value);
export function resolveSectionIcon(value: unknown) {
  return value === 'none' ? undefined : sectionIcons.find(icon => icon.id === value) ?? sectionIcons[0];
}
export function searchSectionIcons(query: string) {
  const words = query.trim().toLowerCase().split(/\s+/);
  return sectionIcons.filter(icon => words.every(word => `${icon.label} ${icon.keywords}`.toLowerCase().includes(word)));
}
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map(value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a: string, b: string) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function mix(color: string, base: string, amount: number) {
  const target = rgb(color);
  return '#' + rgb(base).map((channel, i) => Math.round(channel + (target[i] - channel) * amount).toString(16).padStart(2, '0')).join('');
}
export function sectionAppearance(color: string, surface: string, text: string) {
  const identity = /^#[\da-f]{6}$/i.test(color) ? color : '#808080';
  const dark = luminance(surface) < 0.3;
  let amount = dark ? 0.18 : 0.12;
  let background = mix(identity, surface, amount);
  while (contrastRatio(text, background) < 4.5 && amount > 0) {
    amount = Math.max(0, amount - 0.02);
    background = mix(identity, surface, amount);
  }
  let icon = identity;
  for (let step = 1; contrastRatio(icon, background) < 4.5 && step <= 100; step++) {
    icon = mix(dark ? '#FFFFFF' : '#000000', identity, step / 100);
  }
  // Opaque sRGB interpolation followed by measured WCAG constraints. Every role
  // is resolved against its actual surface; no compositing/opacity assumptions.
  const readable = (seed: string, base: string, ratio: number) => {
    let result = seed;
    const target = luminance(base) < 0.3 ? '#FFFFFF' : '#000000';
    for (let i = 1; contrastRatio(result, base) < ratio && i <= 100; i++) result = mix(target, seed, i / 100);
    return result;
  };
  const projectBackground = mix(identity, surface, dark ? 0.09 : 0.055);
  const primaryBackground = readable(identity, surface, 3);
  const primaryForeground = contrastRatio('#FFFFFF', primaryBackground) >= contrastRatio('#000000', primaryBackground) ? '#FFFFFF' : '#000000';
  const secondaryBackground = mix(identity, surface, dark ? 0.06 : 0.025);
  const hoverBackground = mix(identity, surface, dark ? 0.14 : 0.08);
  // Quiet subheadings and outlined actions also sit directly on the calm surface.
  const secondaryText = readable(readable(readable(identity, secondaryBackground, 4.5), hoverBackground, 4.5), surface, 4.5);
  const pressedBackground = readable(mix(primaryForeground === '#FFFFFF' ? '#000000' : '#FFFFFF', primaryBackground, 0.12), primaryForeground, 4.5);
  return { background, icon, identity, sectionForeground: text,
    projectBackground, projectForeground: readable(text, projectBackground, 4.5), projectBorder: readable(identity, projectBackground, 3),
    primaryBackground, primaryForeground, secondaryBackground, secondaryText, secondaryBorder: readable(identity, secondaryBackground, 3),
    hoverBackground, pressedBackground,
    selectedBackground: background, selectedForeground: readable(identity, background, 4.5),
    disabledBackground: surface, disabledForeground: readable(mix(identity, surface, 0.4), surface, 4.5), focus: readable(identity, surface, 3),
  };
}
