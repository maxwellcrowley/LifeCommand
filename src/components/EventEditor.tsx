import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, TextInput, View } from 'react-native';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { localDateKey } from '@/src/domain/dates';
import { eventKey, eventSources, familyCategories, sourceColors, sourceLabels, type EventInput } from '@/src/domain/events';
import type { EventSource, FamilyCategory, LocalEvent } from '@/src/domain/models';
import { DateEntry } from './DateEntry';
import { Card, Label, Muted, Page } from './ui';

type Draft = { title: string; date: string; startTime: string; endTime: string; location: string; notes: string; source: EventSource; addedBy: 'Max' | 'Kellyn'; category: FamilyCategory };
const toDraft = (event?: LocalEvent, date?: string): Draft => ({ title: event?.title ?? '', date: event?.date ?? date ?? localDateKey(new Date()), startTime: event?.startTime ?? '', endTime: event?.endTime ?? '', location: event?.location ?? '', notes: event?.notes ?? '', source: event?.source ?? 'personal', addedBy: event?.source === 'family' ? event.addedBy : 'Max', category: event?.source === 'family' ? event.category : 'Other' });

export function EventEditor({ event, initialDate }: { event?: LocalEvent; initialDate?: string }) {
  const { addEvent, editEvent, archiveEvent } = useAppData();
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState(() => toDraft(event, initialDate));
  const [snapshot, setSnapshot] = useState(event);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const busy = useRef(false);
  const stale = event?.updatedAt !== snapshot?.updatedAt;
  const field = (key: 'title' | 'startTime' | 'endTime' | 'location' | 'notes', label: string, placeholder = label) => <View style={{ gap: 6 }}>
    <Muted>{label}</Muted>
    <TextInput accessibilityLabel={label} editable={!saving} value={draft[key]} onChangeText={value => setDraft(current => ({ ...current, [key]: value }))} placeholder={placeholder} placeholderTextColor={colors.muted} multiline={key === 'notes'} autoCorrect={key !== 'startTime' && key !== 'endTime'} autoCapitalize={key === 'startTime' || key === 'endTime' ? 'none' : 'sentences'} style={{ color: colors.text, backgroundColor: colors.background, padding: 12, borderRadius: 10, minHeight: key === 'notes' ? 90 : 44, textAlignVertical: 'top' }} />
  </View>;
  const choices = <K extends 'source' | 'addedBy' | 'category'>(key: K, values: readonly Draft[K][]) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{values.map(value => <Pressable key={value} disabled={saving} accessibilityRole="radio" accessibilityState={{ checked: draft[key] === value }} onPress={() => setDraft(current => ({ ...current, [key]: value }))} style={{ borderRadius: 10, padding: 12, minHeight: 44, backgroundColor: draft[key] === value ? colors.soft : colors.background, borderBottomWidth: key === 'source' ? 3 : 0, borderBottomColor: key === 'source' ? sourceColors[value as EventSource] : undefined }}><Label>{key === 'source' ? sourceLabels[value as EventSource] : value}</Label></Pressable>)}</View>;
  const leave = () => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/calendar'); };
  const save = async (archive = false) => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      if (archive && snapshot) await archiveEvent(eventKey(snapshot), snapshot.updatedAt);
      else {
        const common = { title: draft.title, date: draft.date, startTime: draft.startTime, endTime: draft.endTime, location: draft.location, notes: draft.notes };
        const input: EventInput = draft.source === 'family' ? { ...common, source: 'family', addedBy: draft.addedBy, category: draft.category } : { ...common, source: draft.source };
        if (snapshot) await editEvent(eventKey(snapshot), input, snapshot.updatedAt);
        else await addEvent(input);
      }
      leave();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save event.'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <Page title={event ? 'Edit event' : 'New event'} subtitle="Plan a local calendar or family event.">
    <Card title="Event details">
      {field('title', 'Title · required', 'What is happening?')}
      <DateEntry required value={draft.date} onChange={date => setDraft(current => ({ ...current, date }))} />
      <Muted>Calendar source</Muted>{choices('source', eventSources)}
      {draft.source === 'family' ? <><Muted>Added by</Muted>{choices('addedBy', ['Max', 'Kellyn'])}<Muted>Family category</Muted>{choices('category', familyCategories)}</> : null}
      <Muted>Leave both times blank for an all-day event. Times use 24-hour HH:MM on the selected date.</Muted>
      {field('startTime', 'Start time · optional', '09:00')}{field('endTime', 'End time · optional', '10:00')}
      {field('location', 'Location · optional')}{field('notes', 'Notes · optional')}
    </Card>
    {stale ? <Card><Muted>This event changed. Reload its saved details before continuing.</Muted><Pressable disabled={saving} accessibilityRole="button" onPress={() => { setSnapshot(event); setDraft(toDraft(event)); setError(''); setConfirmArchive(false); }} style={{ padding: 12 }}><Label>Reload event</Label></Pressable></Card> : null}
    {error ? <Label style={{ color: colors.danger }}>{error}</Label> : null}
    <Pressable accessibilityRole="button" disabled={saving || stale} onPress={() => void save()} style={{ padding: 15, borderRadius: 12, backgroundColor: colors.soft, opacity: saving || stale ? 0.5 : 1 }}><Label>{saving ? 'Saving…' : 'Save event'}</Label></Pressable>
    {event ? <Card>{confirmArchive ? <><Muted>Archive this event? It will be removed from Calendar, Today, and Ambient.</Muted><Pressable accessibilityRole="button" disabled={saving || stale} onPress={() => void save(true)} style={{ padding: 12 }}><Label style={{ color: colors.danger }}>Confirm archive</Label></Pressable><Pressable accessibilityRole="button" disabled={saving} onPress={() => setConfirmArchive(false)} style={{ padding: 12 }}><Label>Keep event</Label></Pressable></> : <Pressable accessibilityRole="button" disabled={saving || stale} onPress={() => setConfirmArchive(true)} style={{ padding: 12 }}><Label style={{ color: colors.danger }}>Archive event</Label></Pressable>}</Card> : null}
    <Pressable accessibilityRole="button" disabled={saving} onPress={leave} style={{ padding: 12 }}><Label>Cancel</Label></Pressable>
  </Page>;
}
