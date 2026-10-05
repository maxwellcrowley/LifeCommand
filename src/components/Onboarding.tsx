import { useState } from 'react';
import { Modal } from 'react-native';
import { useAppData } from '../data/useAppData';
import { fingerprint } from '../cloud/automatic';
import { normalizeAppData } from '../domain/normalize';
import { seedData } from '../domain/seed';
import { Page, Card, Label, Muted, Row } from './ui';
import { Action } from './TaskScheduling';
import { PersonalizationSettings } from './PersonalizationSettings';
import { CalendarSyncCard } from './CalendarSyncCard';
import { FormError } from './TaskForm';
export function Onboarding() {
  const { data, finishSetup, updateSetting, acceptCloud } = useAppData();
  const [step, setStep] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const run = async (operation: () => Promise<void>) => { setBusy(true); setError(''); try { await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Retry.'); } finally { setBusy(false); } };
  if (!data || data.onboardingComplete !== false) return null;
  return <Modal visible animationType="none" onRequestClose={() => void run(finishSetup)}>
    <Page title="Make LifeCommand yours" subtitle={`Optional setup · ${step + 1} of 4`}>
      <Muted>Your planner starts empty. You can change every choice later in Settings.</Muted>
      {step === 0 ? <PersonalizationSettings mode="sections" /> : step === 1 ? <CalendarSyncCard /> : step === 2 ? <Card title="Rollover"><Muted>Choose what happens to missed work. Automatic preserves LifeCommand’s established rollover behavior.</Muted>{(['automatic', 'stay-overdue', 'morning-review'] as const).map(mode => <Action key={mode} label={`Setup rollover ${mode}`} disabled={busy} onPress={() => void run(() => updateSetting('rolloverMode', mode))} />)}<Action label={`${data.settings.raiseMissedTasksToHigh ? 'Disable' : 'Enable'} priority escalation`} disabled={busy} onPress={() => void run(() => updateSetting('raiseMissedTasksToHigh', !data.settings.raiseMissedTasksToHigh))} /></Card> : <PersonalizationSettings mode="appearance" />}
      {error ? <FormError>{error}</FormError> : null}
      <Row>{step > 0 ? <Action label="Previous setup step" disabled={busy} onPress={() => setStep(s => s - 1)} /> : null}{step < 3 ? <Action label="Next setup step" disabled={busy} onPress={() => setStep(s => s + 1)} /> : <Action label="Finish setup" disabled={busy} onPress={() => void run(finishSetup)} />}</Row>
      <Action label="Skip setup" disabled={busy} onPress={() => void run(finishSetup)} />
      {!data.tasks.length && !data.projects.length && !data.calendarEvents.length && !data.familyEvents.length ? <Card title="Optional sample data"><Label>Prefer to explore with examples?</Label><Muted>This explicitly adds demonstration tasks, projects and events. Leave this alone to keep an empty planner.</Muted><Action label="Add sample data and finish setup" disabled={busy} onPress={() => void run(() => acceptCloud(normalizeAppData({ ...seedData, sections: data.sections, settings: data.settings, onboardingComplete: true }), fingerprint(data)))} /></Card> : null}
    </Page>
  </Modal>;
}
