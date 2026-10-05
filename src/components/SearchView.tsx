import { AppTextInput as TextInput } from '@/src/components/AppText';
import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useAppData } from '../data/useAppData';
import { useCalendarSync } from '../calendar/CalendarSyncProvider';
import { searchData } from '../domain/search';
import type { SavedView } from '../domain/models';
import { useAppTheme } from '../theme/ThemeProvider';
import { TaskList, TaskRow } from './TaskList';
import { EventRow } from './EventRow';
import { Card, Label, Muted, Page, Row } from './ui';
import { Action } from './TaskScheduling';
import { FormError } from './TaskForm';
import { eventKey } from '../domain/events';
export function SearchView() {
  const { data, saveView, deleteView } = useAppData(), { events } = useCalendarSync(), { colors } = useAppTheme();
  const [filter, setFilter] = useState<Omit<SavedView, 'id' | 'name'>>({ query: '', schedule: 'all' });
  const [name, setName] = useState(''), [id, setId] = useState<string>(), [error, setError] = useState(''), [message, setMessage] = useState('');
  if (!data) return <Page title="Search" subtitle="Loading…" />;
  const results = searchData(data, [...data.calendarEvents, ...data.familyEvents, ...events], filter);
  const run = (promise: Promise<void>) => { setError(''); void promise.then(() => setMessage('Saved.')).catch(cause => setError(cause.message)); };
  const input = { minHeight: 48, padding: 12, color: colors.text, backgroundColor: colors.background, borderRadius: 10 };
  const choice = (label: string, key: 'sectionId' | 'projectId' | 'priority' | 'schedule', values: { value: string; label: string }[]) => <View style={{ gap: 6 }}><Label>{label}</Label><Row>{values.map(v => <Action key={v.value} label={`${label}: ${v.label}${filter[key] === v.value ? ', selected' : ''}`} onPress={() => setFilter({ ...filter, [key]: v.value || undefined })} />)}</Row></View>;
  return <Page hasHeader title="Search" subtitle="Tasks, projects and visible events. Event results have no task section, priority or project.">
    <Card><TextInput accessibilityLabel="Search tasks, projects and events" value={filter.query} onChangeText={query => setFilter({ ...filter, query })} placeholder="Search" placeholderTextColor={colors.muted} style={input} />
      {choice('Section', 'sectionId', [{ value: '', label: 'All' }, ...data.sections.map(s => ({ value: s.id, label: s.name }))])}
      {choice('Project', 'projectId', [{ value: '', label: 'All' }, ...data.projects.map(p => ({ value: p.id, label: p.name }))])}
      {choice('Priority', 'priority', ['', 'high', 'normal', 'low'].map(value => ({ value, label: value || 'All' })))}
      {choice('Schedule', 'schedule', ['all', 'scheduled', 'backlog'].map(value => ({ value, label: value })))}
      <Action label="Clear search filters" onPress={() => { setFilter({ query: '', schedule: 'all' }); setId(undefined); setName(''); }} />
    </Card>
    <Card title="Saved views">
      <Muted>Load a view, change its filters or name, then Save view to update it.</Muted>
      <Row>{[['Workday', 'work', ''], ['Family', 'family', ''], ['High Priority', '', 'high']].map(([label, sectionId, priority]) => <Action key={label} label={`Preset ${label}`} onPress={() => { setId(undefined); setName(label); setFilter({ query: '', sectionId: data.sections.some(s => s.id === sectionId) ? sectionId : undefined, priority: priority === 'high' ? 'high' : undefined }); }} />)}</Row>
      {data.savedViews?.map(view => <Row key={view.id}><Action label={`Load view ${view.name}`} onPress={() => { setId(view.id); setName(view.name); setFilter({ query: view.query, sectionId: view.sectionId, projectId: view.projectId, priority: view.priority, schedule: view.schedule }); }} /><Action label={`Delete saved view ${view.name}`} danger onPress={() => run(deleteView(view.id))} /></Row>)}
      <TextInput accessibilityLabel="Saved view name" value={name} onChangeText={setName} placeholder="View name" placeholderTextColor={colors.muted} style={input} /><Action label="Save view" disabled={!name.trim()} onPress={() => run(saveView({ ...filter, id: id ?? `view-${Date.now()}`, name: name.trim() }))} />
      {message ? <Label>{message}</Label> : null}{error ? <FormError>{error}</FormError> : null}
    </Card>
    <Card title={`Tasks · ${results.tasks.length}`}><TaskList tasks={results.tasks.slice(0, 100)} data={data} collapsibleGroups="Search" renderTask={task => <TaskRow task={task} data={data} />} />{!results.tasks.length ? <><Muted>No matching tasks.</Muted><Action label="Capture a task" onPress={() => router.push('/(tabs)/capture')} /></> : results.tasks.length > 100 ? <Muted>Showing the first 100. Refine your filters.</Muted> : null}</Card>
    <Card title={`Projects · ${results.projects.length}`}>{results.projects.slice(0, 100).map(p => <Action key={p.id} label={`Open project ${p.name}`} onPress={() => router.push({ pathname: '/project/[id]', params: { id: p.id } })} />)}{!results.projects.length ? <Muted>No matching projects.</Muted> : null}</Card>
    <Card title={`Events · ${results.events.length}`}>{results.events.slice(0, 100).map(e => <EventRow key={eventKey(e)} event={e} showDate />)}{!results.events.length ? <Muted>No matching visible events.</Muted> : null}</Card>
  </Page>;
}
