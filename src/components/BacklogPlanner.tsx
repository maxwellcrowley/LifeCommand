import { currentPhase } from '../domain/planState';
import { useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { Section } from '../domain/models';
import { sectionAppearance } from '../domain/sectionAppearance';
import { useAppData } from '../data/useAppData';
import { useDevicePreferences } from '../data/DevicePreferences';
import { useCalendarSync } from '../calendar/CalendarSyncProvider';
import { groupTasksBySectionAndProject, type ScheduleSelection } from '../domain/tasks';
import { eventsOnDate, eventKey } from '../domain/events';
import { useAppTheme } from '../theme/ThemeProvider';
import { Action } from './Action';
import { SettingsDialog } from './SettingsDialog';
import { SectionCard, SectionHeader } from './SectionHeader';
import { PriorityPill } from './TaskPresentation';
import { ProjectHeader, ProjectScope } from './ProjectAppearance';
import { AppTextInput } from './AppText';
import { EventRow } from './EventRow';
import { Label, Muted, Row } from './ui';
import { FormError } from './TaskForm';

export function AddFromBacklog({ date, text, section }: { date: string; text?: string; section?: Section }) {
  const { data, schedule } = useAppData(), { preferences: p, save: savePreferences } = useDevicePreferences(), { events } = useCalendarSync(), { colors } = useAppTheme();
  const wide = useWindowDimensions().width >= 1000;
  const [open, setOpen] = useState(false), [selection, setSelection] = useState<ScheduleSelection[]>([]), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const [phaseFilters, setPhaseFilters] = useState<Record<string, string>>({});
  const selectedProject = data?.projects.find(project => project.id === p.plannerProjectId);
  const defaultPhase = selectedProject ? currentPhase(selectedProject)?.id : undefined;
  const phaseFilter = p.plannerProjectId ? phaseFilters[p.plannerProjectId] ?? defaultPhase ?? 'all' : 'all';
  const busy = useRef(false);
  const [opening, setOpening] = useState(false), [launchError, setLaunchError] = useState(''), [focused, setFocused] = useState(false);
  const launchLock = useRef(false);
  const appearance = sectionAppearance(section?.color ?? '#808080', colors.surface, colors.text);
  const launch = async () => {
    if (launchLock.current) return;
    launchLock.current = true; setOpening(true); setLaunchError('');
    try {
      if (section) await savePreferences({ plannerSectionId: section.id, plannerProjectId: undefined, plannerQuery: '', plannerShowSchedule: false });
      setSelection([]); setError(''); setOpen(true);
    } catch { setLaunchError('Could not open this section’s planner. Please retry.'); }
    finally { launchLock.current = false; setOpening(false); }
  };
  const selected = new Set(selection.map(t => t.id));
  const tasks = data?.tasks.filter(t => !t.dueDate && t.status !== 'complete' && t.status !== 'archived' && (!t.projectId || data.projects.some(project => project.id === t.projectId && project.status === 'active')) && (!p.plannerSectionId || t.sectionId === p.plannerSectionId) && (!p.plannerProjectId || t.projectId === p.plannerProjectId) && (phaseFilter === 'all' || (phaseFilter === 'unassigned' ? !t.phaseId : t.phaseId === phaseFilter)) && `${t.title} ${t.description ?? ''}`.toLowerCase().includes(p.plannerQuery.toLowerCase())) ?? [];
  const groups = data ? groupTasksBySectionAndProject(data, tasks).filter(g => g.tasks.length) : [];
  const existing = data?.tasks.filter(t => t.dueDate === date && t.status !== 'archived' && t.status !== 'complete') ?? [];
  const dayEvents = data ? eventsOnDate({ ...data, externalEvents: events }, date) : [];
  const outside = selection.filter(t => !tasks.some(visible => visible.id === t.id)).length;
  const points = data?.tasks.filter(t => selected.has(t.id)).reduce((n, t) => n + t.storyPoints, 0) ?? 0;
  const pref = (patch: Parameters<typeof savePreferences>[0]) => { setError(''); void savePreferences(patch).catch(() => setError('Could not save planning preferences. Please retry.')); };
  const save = async () => { if (busy.current) return; busy.current = true; setSaving(true); setError(''); try { await schedule(selection, date, true); setSelection([]); setOpen(false); } catch (e) { setError(e instanceof Error ? e.message : 'Nothing was scheduled. Retry.'); } finally { busy.current = false; setSaving(false); } };
  const collapse = (key: string) => pref({ collapsed: { [key]: !p.collapsed[key] } });
  return <>{section ? <Pressable accessibilityRole="button" accessibilityLabel={`Add from backlog for ${section.name} · ${date}`} accessibilityState={{ disabled: opening }} disabled={opening} onPress={() => void launch()} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => ({ minHeight: 48, width: '100%', borderWidth: focused ? 2 : 1, borderColor: focused ? appearance.focus : appearance.secondaryBorder, backgroundColor: pressed ? appearance.hoverBackground : colors.surface, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 })}><SymbolView accessible={false} name={{ ios: 'plus', android: 'add', web: 'add' }} tintColor={appearance.secondaryText} size={22} /><Label style={{ color: appearance.secondaryText }}>Add from backlog</Label></Pressable> : <Action label={`Add from backlog · ${date}`} text={text ?? 'Add from backlog'} disabled={opening} onPress={() => void launch()} />}
    {launchError ? <FormError>{launchError}</FormError> : null}
    {open ? <SettingsDialog title={`Plan ${date}`} maxWidth={1100} onClose={() => { if (!busy.current) setOpen(false); }} footer={<>
      <Label>{selection.length} selected · {points} story points · Target: {date}</Label><Muted>{existing.length} tasks already scheduled · {outside} selected outside current filters</Muted>
      {error ? <FormError>{error}</FormError> : null}<Row><Action label="Clear planner selection" text="Clear selection" disabled={saving || !selection.length} onPress={() => setSelection([])} /><Action label="Cancel adding backlog tasks" text="Cancel" disabled={saving} onPress={() => setOpen(false)} /><Action primary label={saving ? 'Adding selected tasks' : error ? `Retry add selected (${selection.length})` : `Add selected (${selection.length})`} text={saving ? 'Scheduling…' : error ? 'Retry Add' : 'Schedule'} disabled={saving || !selection.length} onPress={() => void save()} /></Row>
    </>}>
      {!wide ? <Row><Action label="Planner Backlog" text="Backlog" expanded={!p.plannerShowSchedule} onPress={() => pref({ plannerShowSchedule: false })} /><Action label="Planner Day schedule" text="Day schedule" expanded={p.plannerShowSchedule} onPress={() => pref({ plannerShowSchedule: true })} /></Row> : null}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 20 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 12, display: wide || !p.plannerShowSchedule ? 'flex' : 'none' }}>
          <AppTextInput accessibilityLabel="Filter backlog tasks" value={p.plannerQuery} onChangeText={plannerQuery => pref({ plannerQuery })} placeholder="Search backlog" editable={!saving} style={{ minHeight: 44, padding: 10, color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 10 }} />
          <Row><Action label="Clear planner filters" onPress={() => pref({ plannerSectionId: undefined, plannerProjectId: undefined, plannerQuery: '' })} />{data?.sections.filter(s => !s.archived).map(s => <Action key={s.id} label={`Planner section ${s.name}${p.plannerSectionId === s.id ? ', selected' : ''}`} text={`${p.plannerSectionId === s.id ? '✓ ' : ''}${s.name}`} disabled={saving} onPress={() => pref({ plannerSectionId: p.plannerSectionId === s.id ? undefined : s.id })} />)}</Row>
          <Row>{data?.projects.filter(project => project.status === 'active').map(project => <Action key={project.id} label={`Planner project ${project.name}${p.plannerProjectId === project.id ? ', selected' : ''}`} text={`${p.plannerProjectId === project.id ? '✓ ' : ''}${project.name}`} disabled={saving} onPress={() => pref({ plannerProjectId: p.plannerProjectId === project.id ? undefined : project.id })} />)}</Row>
          {selectedProject?.plan ? <Row>{[{ id: 'all', name: 'All phases' }, ...selectedProject.plan.phases, { id: 'unassigned', name: 'Unassigned' }].map(phase => <Action key={phase.id} label={`Planner phase ${phase.name}${phaseFilter === phase.id ? ', selected' : ''}`} text={`${phaseFilter === phase.id ? '✓ ' : ''}${phase.name}`} onPress={() => setPhaseFilters(filters => ({ ...filters, [selectedProject.id]: phase.id }))} />)}</Row> : null}
          <Muted>{tasks.length} tasks match. Select visible tasks includes collapsed groups matching these filters, not the whole backlog.</Muted>
          <Action label="Select visible tasks" disabled={saving || !tasks.length} onPress={() => setSelection(current => [...current, ...tasks.filter(t => !current.some(item => item.id === t.id)).map(t => ({ id: t.id, updatedAt: t.updatedAt, title: t.title }))])} />
          {groups.map(({ section, tasks: grouped, projectGroups }) => { const key = `Planner:section:${section.id}`, expanded = !p.collapsed[key], count = grouped.filter(t => selected.has(t.id)).length; return <SectionCard key={section.id}>
            <SectionHeader section={section} summary={`${grouped.length} available · ${count} selected`} accessibilityLabel={`${section.name}: ${grouped.length} available, ${count} selected`} expanded={expanded} disabled={saving} onPress={() => collapse(key)} />
            {expanded ? projectGroups.map(group => { const projectKey = `Planner:project:${section.id}:${group.project?.id ?? 'other'}`, projectExpanded = !p.collapsed[projectKey]; return <ProjectScope key={projectKey} project={group.project} sections={data!.sections}><View style={{ gap: 2, padding: 10 }}><ProjectHeader title={group.project?.name ?? 'Other tasks'} summary={`${group.tasks.length} available · ${group.tasks.filter(t => selected.has(t.id)).length} selected`} expanded={projectExpanded} disabled={saving} onPress={() => collapse(projectKey)} />
              {projectExpanded ? group.tasks.map(task => <Pressable key={task.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected.has(task.id), disabled: saving }} aria-checked={selected.has(task.id)} accessibilityLabel={`Select backlog task: ${task.title}`} disabled={saving} onPress={() => setSelection(current => current.some(item => item.id === task.id) ? current.filter(t => t.id !== task.id) : [...current, { id: task.id, updatedAt: task.updatedAt, title: task.title }])} style={{ minHeight: 48, padding: 8, gap: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', backgroundColor: selected.has(task.id) ? colors.selection : colors.surface, borderRadius: 8 }}><SymbolView accessible={false} name={{ ios: selected.has(task.id) ? 'checkmark.circle.fill' : 'circle', android: selected.has(task.id) ? 'check_circle' : 'radio_button_unchecked', web: selected.has(task.id) ? 'check_circle' : 'radio_button_unchecked' }} tintColor={colors.muted} size={24} /><View style={{ flex: 1, minWidth: 100 }}><Label>{task.title}</Label><Muted>{task.storyPoints} points</Muted></View><PriorityPill priority={task.priority} /></Pressable>) : null}
            </View></ProjectScope>; }) : null}
          </SectionCard>; })}
          {!groups.length ? <Muted>No backlog tasks match. Clear filters to review other tasks.</Muted> : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 10, display: wide || p.plannerShowSchedule ? 'flex' : 'none' }}><Label>Day schedule · {date}</Label><Muted>{existing.length} scheduled tasks · {existing.reduce((n, t) => n + t.storyPoints, 0)} story points</Muted>{existing.map(t => <Label key={t.id}>{t.title}</Label>)}{dayEvents.map(event => <EventRow key={eventKey(event)} event={event} />)}{!dayEvents.length ? <Muted>No visible calendar events for this day.</Muted> : null}</View>
      </View>
    </SettingsDialog> : null}
  </>;
}
