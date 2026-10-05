import { AppTextInput as TextInput } from '@/src/components/AppText';
import { useState } from 'react';
import { View } from 'react-native';
import { useAppData } from '../data/useAppData';
import { useDevicePreferences } from '../data/DevicePreferences';
import { presentationChoices } from '../domain/presentation';
import { activeSections, sectionColors } from '../domain/sections';
import type { Section } from '../domain/models';
import { useAppTheme } from '../theme/ThemeProvider';
import { Action } from './TaskScheduling';
import { Card, Label, Muted, Row } from './ui';
import { FormError } from './TaskForm';

export function PersonalizationSettings({ mode }: { mode?: 'sections' | 'appearance' }) {
  const device = useDevicePreferences();
  const { data, saveSection, moveSection, reassignSection } = useAppData();
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState<Section>(), [expected, setExpected] = useState<Section>();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [reassign, setReassign] = useState<string>();
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await operation(); setMessage('Saved.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Please retry.'); }
    finally { setBusy(false); }
  };
  if (!data) return null;
  return <>
    {mode !== 'sections' ? <Card title="This device's appearance">
      <Muted>These preferences stay on this device. Text continues to respect your system text size.</Muted>
      {(Object.keys(presentationChoices) as (keyof typeof presentationChoices)[]).map(key => <View key={key} style={{ gap: 4 }}><Label>{({ textSize: 'Text size', weekStart: 'Week starts', clockFormat: 'Clock format', dateFormat: 'Date format', appearance: 'Appearance', density: 'Density' })[key]}</Label><Row>{presentationChoices[key].map(value => <Action key={value} label={`${key}: ${value}${device.preferences[key] === value ? ', selected' : ''}`} text={`${device.preferences[key] === value ? '✓ ' : ''}${value}`} disabled={busy || !device.ready} onPress={() => void run(() => device.save({ [key]: value }))} />)}</Row></View>)}
      {device.error ? <><FormError>{device.error}</FormError><Action label="Retry device preferences" onPress={device.retry} /></> : null}
    </Card> : null}
    {mode !== 'appearance' ? <Card title="Personal sections">
      <Muted>Archive keeps all tasks and projects. Archived sections remain labeled on existing work; they are unavailable for new capture.</Muted>
      {[...data.sections].sort((a, b) => a.order - b.order).map(section => <View key={section.id} style={{ borderLeftWidth: 4, borderLeftColor: section.color, paddingLeft: 10, gap: 4 }}>
        <Label>{section.name}{section.archived ? ' · Archived' : ''}</Label>
        <Muted>{data.tasks.filter(t => t.sectionId === section.id).length} tasks · {data.projects.filter(p => p.sectionId === section.id).length} projects</Muted>
        <Row><Action label={`Edit section ${section.name}`} text="Edit" disabled={busy} onPress={() => { setDraft({ ...section }); setExpected(section); }} />
          <Action label={`Move ${section.name} up`} text="↑ Up" disabled={busy} onPress={() => void run(() => moveSection(section.id, -1))} />
          <Action label={`Move ${section.name} down`} text="↓ Down" disabled={busy} onPress={() => void run(() => moveSection(section.id, 1))} />
          <Action label={`${section.archived ? 'Restore' : 'Archive'} ${section.name}`} disabled={busy} onPress={() => void run(() => saveSection({ ...section, archived: !section.archived }, section))} />
          <Action label={`Reassign contents of ${section.name}`} disabled={busy} onPress={() => setReassign(section.id)} /></Row>
        {reassign === section.id ? <><Muted>Move all tasks and projects, including completed and archived work, to:</Muted>{activeSections(data.sections).filter(s => s.id !== section.id).map(target => <Action key={target.id} label={`Move contents to ${target.name}`} disabled={busy} onPress={() => void run(async () => { await reassignSection(section.id, target.id); setReassign(undefined); })} />)}<Action label="Cancel reassignment" onPress={() => setReassign(undefined)} /></> : null}
      </View>)}
      <Action label="Create section" disabled={busy} onPress={() => { setExpected(undefined); setDraft({ id: `section-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: '', color: sectionColors[0][1], order: data.sections.length }); }} />
      {draft ? <View style={{ gap: 8 }}><TextInput accessibilityLabel="Section name" value={draft.name} maxLength={60} onChangeText={name => setDraft({ ...draft, name })} style={{ color: colors.text, backgroundColor: colors.background, minHeight: 48, padding: 12 }} />
        <Row>{sectionColors.map(([name, color]) => <View key={color} style={{ borderLeftWidth: 4, borderLeftColor: color }}><Action label={`Section color ${name}${draft.color === color ? ', selected' : ''}`} text={`${draft.color === color ? '✓ ' : ''}${name}`} onPress={() => setDraft({ ...draft, color })} /></View>)}</Row>
        <Action label="Save section" disabled={busy} onPress={() => void run(async () => { await saveSection(draft, expected); setDraft(undefined); })} /><Action label="Cancel section edit" disabled={busy} onPress={() => setDraft(undefined)} /></View> : null}
    </Card> : null}
    {busy ? <Muted>Saving…</Muted> : message ? <Label>{message}</Label> : null}{error ? <FormError>{error}</FormError> : null}
  </>;
}
