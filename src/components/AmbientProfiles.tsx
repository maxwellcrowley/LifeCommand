import { useState } from 'react';
import { useDevicePreferences } from '../data/DevicePreferences';
import { ambientProfiles } from '../domain/presentation';
import { Card, Muted, Label, Row } from './ui';
import { Action } from './TaskScheduling';
import { FormError } from './TaskForm';
export function AmbientProfiles() {
  const { preferences, save } = useDevicePreferences();
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const run = (operation: Promise<void>) => { setError(''); void operation.then(() => setMessage('Saved on this device.')).catch(cause => setError(cause.message)); };
  return <Card title="Ambient device profile">
    <Muted>Choose a starting layout, then adjust the existing display controls below. Profiles and privacy stay on this device.</Muted>
    <Row>{(['desk', 'tablet', 'tv'] as const).map(ambientProfile => <Action key={ambientProfile} label={`Ambient profile ${ambientProfile}${preferences.ambientProfile === ambientProfile ? ', selected' : ''}`} onPress={() => run(save({ ambientProfile, ambient: { ...preferences.ambient, ...ambientProfiles[ambientProfile] } }))} />)}</Row>
    <Action label={`${preferences.hideSensitiveTitles ? 'Show' : 'Hide'} sensitive titles in ambient display`} onPress={() => run(save({ hideSensitiveTitles: !preferences.hideSensitiveTitles }))} />
    <Muted>When hidden, all task and event titles, including Next Event and tomorrow’s preview, become “Private item” visually and for screen readers. Counts and times remain visible.</Muted>
    {message ? <Label>{message}</Label> : null}{error ? <FormError>{error}</FormError> : null}
  </Card>;
}
