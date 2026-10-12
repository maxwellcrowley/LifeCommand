import { useState } from 'react';
import { View } from 'react-native';
import { useDevicePreferences } from '../data/DevicePreferences';
import { presentationChoices, presentationDefaults } from '../domain/presentation';
import { Action } from './TaskScheduling';
import { Card, Label, Muted, Row } from './ui';
import { FormError } from './TaskForm';
import { SectionSettings } from './SectionSettings';

export function PersonalizationSettings({ mode }: { mode?: 'sections' | 'appearance' }) {
  const device = useDevicePreferences();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await operation(); setMessage('Saved.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Please retry.'); }
    finally { setBusy(false); }
  };
  return <>
    {mode !== 'sections' ? <Card title="This device's appearance">
      <Muted>These preferences stay on this device for this account. Text continues to respect your system text size.</Muted>
      {(Object.keys(presentationChoices) as (keyof typeof presentationChoices)[]).map(key => <View key={key} style={{ gap: 4 }}><Label>{({ textSize: 'Text size', weekStart: 'Week starts', clockFormat: 'Clock format', dateFormat: 'Date format', appearance: 'Appearance', density: 'Density' })[key]}</Label><Row>{presentationChoices[key].map(value => <Action key={value} label={`${key}: ${value}${device.preferences[key] === value ? ', selected' : ''}`} text={`${device.preferences[key] === value ? '✓ ' : ''}${value}`} disabled={busy || !device.ready} onPress={() => void run(() => device.save({ [key]: value }))} />)}</Row></View>)}
      <Muted>Resetting appearance changes only this account’s device preferences. It never deletes records, calendar connections, or selections.</Muted>
      <Action label="Reset appearance preferences" disabled={busy || !device.ready} onPress={() => void run(() => device.save({ appearance: presentationDefaults.appearance, density: presentationDefaults.density, textSize: presentationDefaults.textSize, weekStart: presentationDefaults.weekStart, clockFormat: presentationDefaults.clockFormat, dateFormat: presentationDefaults.dateFormat }))} />
      {device.error ? <><FormError>{device.error}</FormError><Action label="Retry device preferences" onPress={device.retry} /></> : null}
    </Card> : null}
    {mode !== 'appearance' ? <SectionSettings /> : null}
    {busy ? <Muted>Saving…</Muted> : message ? <Label>{message}</Label> : null}{error ? <FormError>{error}</FormError> : null}
  </>;
}
