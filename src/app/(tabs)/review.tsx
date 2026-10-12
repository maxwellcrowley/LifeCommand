import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Disclosure } from '@/src/components/Disclosure';
import { Action } from '@/src/components/TaskScheduling';
import { DateEntry } from '@/src/components/DateEntry';
import { FormError } from '@/src/components/TaskForm';
import { TaskList, TaskRow } from '@/src/components/TaskList';
import { ProjectHeader, ProjectScope } from '@/src/components/ProjectAppearance';
import { Card, Label, Muted, Page, Row } from '@/src/components/ui';
import { useDevicePreferences } from '@/src/data/DevicePreferences';
import { useAppData } from '@/src/data/useAppData';
import { classifyReview, reviewNames } from '@/src/domain/review';
import { localDateKey } from '@/src/domain/dates';
import type { ScheduleSelection } from '@/src/domain/tasks';
import { useLocalClock } from '@/src/hooks/useLocalClock';

export default function ReviewScreen() {
  const { data, error: storageError, schedule } = useAppData(), { preferences } = useDevicePreferences();
  const now = useLocalClock();
  const [selection, setSelection] = useState<ScheduleSelection[]>([]), [date, setDate] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const busy = useRef(false);
  if (!data || !now) return <Page title="Review" subtitle={storageError || 'Loading review…'} />;
  const today = localDateKey(now), classified = classifyReview(data, today, preferences);
  const run = async (operation: () => Promise<void>) => { if (busy.current) return; busy.current = true; setSaving(true); setError(''); try { await operation(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Retry.'); } finally { busy.current = false; setSaving(false); } };
  return <Page title="Review" subtitle="Planning opportunities, not a scorecard.">
    <Muted>Each task appears once, in your first matching group. Additional reasons remain on its row. Change groups, order and thresholds in Settings → What do I see?.</Muted>
    {selection.length ? <Card title={`${selection.length} selected for scheduling`}><DateEntry value={date || today} onChange={setDate} /><Row><Action primary label="Schedule selected Review tasks" disabled={saving} onPress={() => void run(async () => { await schedule(selection, date || today); setSelection([]); })} /><Action label="Clear Review selection" disabled={saving} onPress={() => setSelection([])} /></Row></Card> : null}
    {error ? <FormError>{error}</FormError> : null}
    {!preferences.reviewGroups.length ? <Muted>All Review groups are hidden. Enable groups in Settings.</Muted> : null}
    {preferences.reviewGroups.map(group => {
      if (group === 'projects') return <Card key={group}><Disclosure title={reviewNames[group]} count={classified.projects.length} storageKey="Review:projects">{classified.projects.length ? classified.projects.map(({ project, reason }) => <ProjectScope key={project.id} project={project} sections={data.sections}><View style={{ gap: 8 }}><ProjectHeader title={project.name} /><Muted>{reason}</Muted><Action label={`Open project ${project.name}`} text="Open project" onPress={() => router.push({ pathname: '/project/[id]', params: { id: project.id } })} /></View></ProjectScope>) : <Muted>No active projects need a next-step review.</Muted>}</Disclosure></Card>;
      const entries = classified.entries.filter(entry => entry.group === group);
      return <Card key={group}><Disclosure title={reviewNames[group]} count={entries.length} storageKey={`Review:${group}`}>
        {group === 'postponed' ? <Muted>Tracking actual actions going forward; older lifetime history is not inferred. Default threshold is three manual postponements since completion.</Muted> : null}
        {group === 'needs-date' ? <Muted>Plan these tasks when ready. Intentional backlog sections can be excluded in Settings.</Muted> : null}
        {entries.length ? <><Action label={`Select visible ${reviewNames[group]} tasks`} disabled={saving} onPress={() => setSelection(current => [...current, ...entries.filter(e => !current.some(t => t.id === e.task.id)).map(e => ({ id: e.task.id, updatedAt: e.task.updatedAt, title: e.task.title }))])} /><TaskList collapsibleGroups={`Review:${group}`} tasks={entries.map(e => e.task)} data={data} renderTask={task => <View style={{ gap: 6 }}>
          <Pressable accessibilityRole="checkbox" accessibilityLabel={`Select Review task: ${task.title}`} accessibilityState={{ checked: selection.some(t => t.id === task.id), disabled: saving }} disabled={saving} onPress={() => setSelection(current => current.some(t => t.id === task.id) ? current.filter(t => t.id !== task.id) : [...current, { id: task.id, updatedAt: task.updatedAt, title: task.title }])} style={{ minHeight: 44, justifyContent: 'center' }}><Label>{selection.some(t => t.id === task.id) ? '✓ Selected' : 'Select for scheduling'}</Label></Pressable>
          <TaskRow grouped task={task} data={data} date={today} disabled={saving} /><Muted>{entries.find(e => e.task.id === task.id)?.reasons.join(' · ')}</Muted>
        </View>} /></> : <Muted>No tasks in this group.</Muted>}
      </Disclosure></Card>;
    })}
  </Page>;
}
