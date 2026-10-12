import { useState } from 'react';
import { router } from 'expo-router';
import { useAppData } from '../data/useAppData';
import { useDevicePreferences } from '../data/DevicePreferences';
import { useCalendarSync } from '../calendar/CalendarSyncProvider';
import { searchData } from '../domain/search';
import { viewProblems, type TaskFilter } from '../domain/savedViews';
import { localDateKey } from '../domain/dates';
import { useLocalClock } from '../hooks/useLocalClock';
import type { SavedView } from '../domain/models';
import { useAppTheme } from '../theme/ThemeProvider';
import { AppTextInput } from './AppText';
import { TaskList, TaskRow } from './TaskList';
import { EventRow } from './EventRow';
import { Card, Muted, Page, Row } from './ui';
import { Action } from './Action';
import { FormError } from './TaskForm';
import { SavedViewEditor } from './SavedViewEditor';
import { eventKey } from '../domain/events';
const newViewId = () => `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export function SearchView() {
  const { data } = useAppData(), { events } = useCalendarSync(), { colors } = useAppTheme(), { preferences: p, save } = useDevicePreferences();
  const now = useLocalClock();
  const [custom, setCustom] = useState<TaskFilter>(), [editor, setEditor] = useState<SavedView>(), [error, setError] = useState('');
  if (!data || !now) return <Page title="Search" subtitle="Loading…" />;
  const active = data.savedViews?.find(view => view.id === p.activeSavedViewId);
  const filter: TaskFilter = custom ?? active ?? { query: '', schedule: 'all' };
  const missing = viewProblems(data, filter);
  const results = searchData(data, [...data.calendarEvents, ...data.familyEvents, ...events], filter, localDateKey(now), p.weekStart);
  if (p.activeSavedViewId && !active && !custom) { results.tasks = []; results.projects = []; }
  const select = (id?: string) => { setCustom(undefined); setError(''); void save({ activeSavedViewId: id ?? '' }).catch(() => setError('Could not remember the active view. Retry.')); };
  const clear = () => { select(); setCustom({ query: '', schedule: 'all' }); };
  const makeEditor = () => setEditor({ ...filter, id: active?.id ?? newViewId(), name: active?.name ?? '', sectionIds: filter.sectionIds ?? (filter.sectionId ? [filter.sectionId] : []), projectIds: filter.projectIds ?? (filter.projectId ? [filter.projectId] : []), priorities: filter.priorities ?? (filter.priority ? [filter.priority] : []), sectionId: undefined, projectId: undefined, priority: undefined });
  return <Page hasHeader title="Search" subtitle="Saved task views and independent event search.">
    <Card title={active ? `Active view: ${active.name}${custom ? ' · modified' : ''}` : 'Active filters'}>
      <AppTextInput accessibilityLabel="Search tasks, projects and events" value={filter.query} onChangeText={query => setCustom({ ...filter, query })} placeholder="Search" style={{ minHeight: 48, padding: 12, color: colors.text, backgroundColor: colors.background }} />
      <Muted>{(filter.sectionIds ?? (filter.sectionId ? [filter.sectionId] : [])).map(id => data.sections.find(s => s.id === id)?.name ?? 'Missing section').join(', ') || 'All sections'} · {(filter.projectIds ?? (filter.projectId ? [filter.projectId] : [])).map(id => data.projects.find(project => project.id === id)?.name ?? 'Missing project').join(', ') || 'All projects'} · {filter.priorities?.join(', ') || filter.priority || 'All priorities'} · {filter.phaseIds?.map(id => data.projects.flatMap(p => p.plan?.phases ?? []).find(phase => phase.id === id)?.name ?? 'Missing phase').join(', ') || 'All phases'} ? {filter.completion || 'all'} · {filter.schedule || 'all'} · {filter.dateMode || 'any date'}{filter.dateMode === 'fixed' ? ` ${filter.dateFrom}–${filter.dateThrough}` : ''}</Muted>
      <Row><Action label="Clear search filters" text="Clear filters" onPress={clear} /><Action label="Preset High priority" text="High priority" onPress={() => { select(); setCustom({ query: '', priority: 'high' }); }} /><Action label="Edit view filters" text="Customize / save view" onPress={makeEditor} /></Row>
      {missing.length || (p.activeSavedViewId && !active && !custom) ? <FormError>This view needs updating. A referenced section, project, phase, or saved view no longer exists. Results have not been broadened.</FormError> : null}
      {error ? <FormError>{error}</FormError> : null}
    </Card>
    <Card title="Saved views"><Muted>Definitions sync with your account; the active view stays on this device for this account. Views currently support Search task results.</Muted><Row>{data.savedViews?.map(view => <Action key={view.id} label={`Load view ${view.name}`} text={`${active?.id === view.id ? '✓ ' : ''}${view.name}`} onPress={() => select(view.id)} />)}</Row></Card>
    <Card title={`Tasks · ${results.tasks.length}`}><TaskList tasks={results.tasks} data={data} collapsibleGroups="Search" renderTask={task => <TaskRow task={task} data={data} />} />{!results.tasks.length ? <><Muted>No matching tasks. Clear filters or update this view.</Muted><Action label="Clear empty search filters" text="Clear filters" onPress={clear} /></> : null}</Card>
    <Card title={`Projects · ${results.projects.length}`}>{results.projects.map(project => <Action key={project.id} label={`Open project ${project.name}`} onPress={() => router.push({ pathname: '/project/[id]', params: { id: project.id } })} />)}</Card>
    <Card title={`Events · ${results.events.length}`}><Muted>Only search text applies to events. Task sections, priorities, completion and dates never hide appointments.</Muted>{results.events.map(event => <EventRow key={eventKey(event)} event={event} showDate />)}</Card>
    {editor ? <SavedViewEditor key={editor.id} initial={editor} existing={!!data.savedViews?.some(v => v.id === editor.id)} onClose={() => setEditor(undefined)} onSaved={view => { setEditor(undefined); select(view?.id); }} /> : null}
  </Page>;
}
