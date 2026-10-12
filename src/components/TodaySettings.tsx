import { useState } from 'react';
import { View } from 'react-native';
import { useDevicePreferences } from '../data/DevicePreferences';
import { useAppData } from '../data/useAppData';
import { presentationDefaults, type TodayArea } from '../domain/presentation';
import { Card, Label, Muted, Row } from './ui';
import { Action } from './TaskScheduling';
import { FormError } from './TaskForm';
const areas: TodayArea[] = ['tasks', 'calendar', 'rollover', 'reminders'];
const names = { tasks: 'Tasks', calendar: 'Schedule', rollover: 'Rollover', reminders: 'Reminders', 'next-event': 'Schedule' };

export function TodaySettings() {
  const { preferences, save } = useDevicePreferences();
  const { data } = useAppData();
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const run = (promise: Promise<void>) => { setError(''); setMessage(''); void promise.then(() => setMessage('Saved.')).catch(cause => setError(cause.message)); };
  const extras: TodayArea[] = preferences.todayAreas.filter(area => area === 'rollover' || area === 'reminders');
  return <Card title="Today layout">
    <Muted>Tasks appear first on phones and beside Schedule on wide screens. Rollover and reminders start hidden. These choices stay on this device.</Muted>
    {[...preferences.todayAreas, ...areas.filter(a => !preferences.todayAreas.includes(a))].map(area => <Row key={area}>
      <Label>{names[area]}</Label>
      <Action label={`${preferences.todayAreas.includes(area) ? 'Hide' : 'Show'} Today ${area}`} onPress={() => run(save({ todayAreas: preferences.todayAreas.includes(area) ? preferences.todayAreas.filter(a => a !== area) : [...preferences.todayAreas, area] }))} />
      {extras.indexOf(area) > 0 ? <Action label={`Move ${area} earlier`} onPress={() => {
        const next = [...preferences.todayAreas], i = next.indexOf(area), previous = next.indexOf(extras[extras.indexOf(area) - 1]);
        [next[previous], next[i]] = [next[i], next[previous]]; run(save({ todayAreas: next }));
      }} /> : null}
    </Row>)}
    <Label>Visible task sections</Label><View style={{ gap: 6 }}>{data?.sections.map(s => <Action key={s.id} label={`${preferences.hiddenSections.includes(s.id) ? 'Show' : 'Hide'} Today section ${s.name}`} onPress={() => run(save({ hiddenSections: preferences.hiddenSections.includes(s.id) ? preferences.hiddenSections.filter(id => id !== s.id) : [...preferences.hiddenSections, s.id] }))} />)}</View>
    <Action label={`${preferences.showCompleted ? 'Hide' : 'Show'} completed tasks`} onPress={() => run(save({ showCompleted: !preferences.showCompleted, collapsed: { 'Today:completed': preferences.showCompleted } }))} />
    <Label>Focus today</Label>
    <Muted>Focus is optional and stays on this device. Pinning never changes task dates or priority.</Muted>
    <Row><Action label={`${preferences.focusVisible ? 'Hide' : 'Show'} Focus today`} onPress={() => run(save({ focusVisible: !preferences.focusVisible }))} />{([1, 2, 3, 4, 5] as const).map(limit => <Action key={limit} label={`Focus limit ${limit}${preferences.focusLimit === limit ? ', selected' : ''}`} text={`${preferences.focusLimit === limit ? '✓ ' : ''}${limit}`} onPress={() => run(save({ focusLimit: limit }))} />)}</Row>
    <Muted>Reset restores Tasks and Schedule, shows all sections, and collapses Completed today. Saved tasks and account planning settings stay as they are.</Muted>
    <Action label="Reset Today layout" onPress={() => run(save({ todayAreas: presentationDefaults.todayAreas, hiddenSections: [], showCompleted: false, focusVisible: presentationDefaults.focusVisible, focusLimit: presentationDefaults.focusLimit, focusTaskIds: [],
      collapsed: { ...Object.fromEntries(Object.keys(preferences.collapsed).filter(key => key.startsWith('Today:')).map(key => [key, false])), 'Today:completed': true } }))} />
    {message ? <Label>{message}</Label> : null}{error ? <FormError>{error}</FormError> : null}
  </Card>;
}

export function DayPlanningSettings() {
  const { data, updateSetting } = useAppData();
  const [error, setError] = useState('');
  return <Card title="Day planning">
    {(['automatic', 'stay-overdue', 'morning-review'] as const).map(mode => <Action key={mode} label={`Rollover: ${mode}${(data?.settings.rolloverMode ?? (data?.settings.autoRollover ? 'automatic' : 'stay-overdue')) === mode ? ', selected' : ''}`} onPress={() => { setError(''); void updateSetting('rolloverMode', mode).catch(cause => setError(cause.message)); }} />)}
    <Muted>Automatic uses the rollover time below. Stay overdue keeps the original schedule. Morning review keeps missed work in Review until you schedule it.</Muted>
    {error ? <FormError>{error}</FormError> : null}
  </Card>;
}
