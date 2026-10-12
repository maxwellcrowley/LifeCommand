import { useRef, useState } from 'react';
import { View, TextInput } from 'react-native';
import type { SavedView } from '../domain/models';
import { useAppData } from '../data/useAppData';
import { useAppTheme } from '../theme/ThemeProvider';
import { viewProblems } from '../domain/savedViews';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { SettingsDialog } from './SettingsDialog';
import { AppTextInput } from './AppText';
import { Action } from './Action';
import { DateEntry } from './DateEntry';
import { Label, Muted, Row } from './ui';
import { FormError } from './TaskForm';
export function SavedViewEditor({ initial, existing, onClose, onSaved }: { initial: SavedView; existing: boolean; onClose: () => void; onSaved: (view?: SavedView) => void }) {
  const { data, saveView, deleteView } = useAppData(), { colors } = useAppTheme();
  const [draft, setDraft] = useState(initial), [confirm, setConfirm] = useState<'discard' | 'delete'>(), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const expected = useRef(data?.savedViews?.find(view => view.id === initial.id));
  const pending = useRef(false), input = useRef<TextInput>(null);
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft), guard = useUnsavedChanges(dirty || busy);
  const close = () => { if (!pending.current) { if (confirm) setConfirm(undefined); else if (dirty) setConfirm('discard'); else onClose(); } };
  const run = async (remove = false) => { if (pending.current || !data) return; pending.current = true; setBusy(true); setError(''); try { if (remove) await deleteView(draft.id, expected.current); else { if (viewProblems(data, draft).length) throw Error('Remove missing section/project references before saving.'); await saveView(draft, expected.current); } guard.allowLeave(); onSaved(remove ? undefined : draft); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Retry.'); } finally { pending.current = false; setBusy(false); } };
  const multi = (title: string, key: 'sectionIds' | 'projectIds' | 'phaseIds' | 'priorities', options: { id: string; name: string }[]) => <View style={{ gap: 6 }}><Label>{title}</Label><Row>{options.map(option => <Action key={option.id} label={`${title}: ${option.name}${draft[key]?.includes(option.id as never) ? ', selected' : ''}`} text={`${draft[key]?.includes(option.id as never) ? '✓ ' : ''}${option.name}`} disabled={busy} onPress={() => setDraft(d => ({ ...d, [key]: d[key]?.includes(option.id as never) ? d[key]?.filter(id => id !== option.id) : [...(d[key] ?? []), option.id] }))} />)}</Row></View>;
  return <><SettingsDialog title={confirm ? confirm === 'delete' ? 'Delete saved view?' : 'Discard view changes?' : existing ? 'Edit saved view' : 'Create saved view'} onClose={close} onShow={() => input.current?.focus()} footer={<>{error ? <FormError>{error}</FormError> : null}<Row>{confirm ? <><Action label="Keep editing view" disabled={busy} onPress={() => setConfirm(undefined)} /><Action danger label={confirm === 'delete' ? 'Confirm delete saved view' : 'Discard view changes'} disabled={busy} onPress={() => confirm === 'delete' ? void run(true) : onClose()} /></> : <><Action label="Cancel view edit" text="Cancel" disabled={busy} onPress={close} /><Action primary label="Save view" disabled={busy} text={busy ? 'Saving…' : error ? 'Retry save' : 'Save view'} onPress={() => void run()} /></>}</Row></>}>
    {confirm ? <Muted>{confirm === 'delete' ? 'Only the view definition is removed. Tasks, projects and events are kept.' : 'Discard unsaved changes to this view?'}</Muted> : <>
      <Muted>Views apply to task results in Search. They sync with this account. Calendar events remain independent of task filters.</Muted>
      <Label>Name</Label><AppTextInput editable={!busy} ref={input} accessibilityLabel="Saved view name" value={draft.name} onChangeText={name => setDraft(d => ({ ...d, name }))} style={{ minHeight: 44, padding: 10, color: colors.text, borderWidth: 1, borderColor: colors.border }} />
      <Label>Search text</Label><AppTextInput editable={!busy} accessibilityLabel="Saved view query" value={draft.query} onChangeText={query => setDraft(d => ({ ...d, query }))} style={{ minHeight: 44, padding: 10, color: colors.text }} />
      {multi('Sections', 'sectionIds', data?.sections ?? [])}{multi('Projects', 'projectIds', data?.projects ?? [])}{multi('Phases', 'phaseIds', data?.projects.flatMap(p => p.plan?.phases.map(phase => ({ id: phase.id, name: `${p.name} / ${phase.name}` })) ?? []) ?? [])}{multi('Priorities', 'priorities', ['high', 'normal', 'low'].map(id => ({ id, name: id })))}
      <Muted>No selection means all. Missing references keep the view empty until you update it.</Muted>
      {data && viewProblems(data, draft).length ? <><FormError>This view needs updating: a section, project or phase no longer exists.</FormError><Action label="Remove missing view references" disabled={busy} onPress={() => setDraft(d => ({ ...d, sectionId: undefined, projectId: undefined, phaseIds: d.phaseIds?.filter(id => data.projects.some(p => p.plan?.phases.some(phase => phase.id === id))), sectionIds: d.sectionIds?.filter(id => data.sections.some(s => s.id === id)), projectIds: d.projectIds?.filter(id => data.projects.some(p => p.id === id)) }))} /></> : null}
      <Label>Completion</Label><Row>{(['all', 'open', 'complete'] as const).map(completion => <Action key={completion} label={`Completion: ${completion}${draft.completion === completion ? ', selected' : ''}`} disabled={busy} onPress={() => setDraft(d => ({ ...d, completion }))} />)}</Row>
      <Label>Scheduling</Label><Row>{(['all', 'scheduled', 'backlog'] as const).map(schedule => <Action key={schedule} label={`Schedule: ${schedule}${draft.schedule === schedule ? ', selected' : ''}`} disabled={busy} onPress={() => setDraft(d => ({ ...d, schedule }))} />)}</Row>
      <Label>Dates</Label><Row>{(['any', 'today', 'this-week', 'overdue', 'fixed'] as const).map(dateMode => <Action key={dateMode} label={`Dates: ${dateMode}${draft.dateMode === dateMode ? ', selected' : ''}`} disabled={busy} onPress={() => setDraft(d => ({ ...d, dateMode }))} />)}</Row>
      {draft.dateMode === 'fixed' ? <><Label>From</Label><DateEntry value={draft.dateFrom ?? ''} onChange={dateFrom => !busy && setDraft(d => ({ ...d, dateFrom }))} /><Label>Through</Label><DateEntry value={draft.dateThrough ?? ''} onChange={dateThrough => !busy && setDraft(d => ({ ...d, dateThrough }))} /></> : null}
      <Muted>This week updates with the local date and your week-start preference. Fixed dates do not move.</Muted>
      {existing ? <Action danger disabled={busy} label="Delete this saved view" onPress={() => setConfirm('delete')} /> : null}
    </>}
  </SettingsDialog>{guard.prompt}</>;
}
