import { useRef, useState } from 'react';
import { Modal } from 'react-native';
import { useAppData } from '../data/useAppData';
import { fingerprint } from '../cloud/automatic';
import { normalizeAppData } from '../domain/normalize';
import { seedData } from '../domain/seed';
import { Page, Card, Muted, Row } from './ui';
import { Action } from './Action';
import { PersonalizationSettings } from './PersonalizationSettings';
import { CalendarSyncCard } from './CalendarSyncCard';
import { FormError } from './TaskForm';
import { AppTextInput } from './AppText';
import { useAppTheme } from '../theme/ThemeProvider';

export function Onboarding({ replay = false, onClose }: { replay?: boolean; onClose?: () => void }) {
  const { data, finishSetup, addTask, acceptCloud } = useAppData(), { colors } = useAppTheme();
  const [step, setStep] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(''), [sectionId, setSectionId] = useState(''), [captured, setCaptured] = useState(false), [discard, setDiscard] = useState(false);
  const running = useRef(false);
  const run = async (operation: () => Promise<void>) => { if (running.current) return; running.current = true; setBusy(true); setError(''); try { await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Retry.'); } finally { running.current = false; setBusy(false); } };
  const finish = async () => { if (!replay) await finishSetup(); onClose?.(); };
  const requestClose = () => { if (busy) return; if (title.trim()) setDiscard(true); else void run(finish); };
  if (!data || (!replay && data.onboardingComplete !== false)) return null;
  return <Modal visible animationType="none" onRequestClose={requestClose}>
    <Page title="Make LifeCommand yours" subtitle={`Optional setup · ${step + 1} of 4`}>
      <Muted>Tasks are individual next actions. Projects collect related tasks. Calendars show timed events separately. All steps are optional; existing work stays in place.</Muted>
      {step === 0 ? <PersonalizationSettings mode="sections" /> : step === 1 ? <Card title="Capture a first task">
        <Muted>Choose a section, then capture one small next action. It goes to your backlog until you schedule it.</Muted>
        <AppTextInput accessibilityLabel="Setup first task title" editable={!busy} value={title} onChangeText={setTitle} placeholder="What would you like to do?" style={{ minHeight: 48, padding: 12, color: colors.text, backgroundColor: colors.background }} />
        <Row>{data.sections.filter(s => !s.archived).map(s => <Action key={s.id} label={`Setup section ${s.name}`} text={`${(sectionId || data.sections.find(s => !s.archived)?.id) === s.id ? '✓ ' : ''}${s.name}`} disabled={busy} onPress={() => setSectionId(s.id)} />)}</Row>
        <Action label="Capture setup task" primary disabled={busy || !title.trim()} onPress={() => void run(async () => { await addTask({ title, sectionId: sectionId || data.sections.find(s => !s.archived)!.id }); setTitle(''); setCaptured(true); })} />
        {captured ? <Muted>Task saved. Schedule it from Today’s Add from backlog.</Muted> : null}
      </Card> : step === 2 ? <CalendarSyncCard /> : <PersonalizationSettings mode="appearance" />}
      {error ? <FormError>{error}</FormError> : null}
      <Row>{step > 0 ? <Action label="Previous setup step" disabled={busy} onPress={() => setStep(s => s - 1)} /> : null}{step < 3 ? <Action label="Next setup step" disabled={busy} onPress={() => setStep(s => s + 1)} /> : <Action label="Finish setup" disabled={busy} onPress={requestClose} />}</Row>
      <Action label="Skip setup" disabled={busy} onPress={requestClose} />
      {discard ? <Card title="Unsaved task"><Muted>Capture this task before leaving, or discard its draft.</Muted><Row><Action label="Keep setup draft" onPress={() => { setDiscard(false); setStep(1); }} /><Action label="Discard setup draft and close" danger onPress={() => void run(finish)} /></Row></Card> : null}
      {!replay && !data.tasks.length && !data.projects.length && !data.calendarEvents.length && !data.familyEvents.length ? <Card title="Optional sample data"><Muted>Only this button adds demonstration records. Leave it alone to keep an empty planner.</Muted><Action label="Add sample data and finish setup" disabled={busy} onPress={() => void run(() => acceptCloud(normalizeAppData({ ...seedData, sections: data.sections, settings: data.settings, onboardingComplete: true }), fingerprint(data)))} /></Card> : null}
    </Page>
  </Modal>;
}
