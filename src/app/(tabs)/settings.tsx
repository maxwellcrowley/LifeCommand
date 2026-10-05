import { useAccount } from '@/src/cloud/AccountBoundary';
import { AppTextInput as TextInput } from '@/src/components/AppText';
import { AmbientProfiles } from '@/src/components/AmbientProfiles';
import { RecurrenceSettings } from '@/src/components/RecurrenceSettings';
import { AutomaticSyncCard } from '@/src/components/AutomaticSyncCard';
import { TodaySettings, DayPlanningSettings } from '@/src/components/TodaySettings';
import { PersonalizationSettings } from '@/src/components/PersonalizationSettings';
import { CalendarSyncCard } from '@/src/components/CalendarSyncCard';
import { ReminderSettingsCard } from '@/src/components/ReminderSettingsCard';
import { NotificationSettingsCard } from '@/src/components/NotificationSettingsCard';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { AmbientSettingsCard } from '@/src/components/AmbientSettingsCard';
import { DataManagementCard } from '@/src/components/DataManagementCard';
import { CloudSyncCard } from '@/src/components/CloudSyncCard';
import { Card, Label, Muted, Page, Row } from '@/src/components/ui';
import { FormError } from '@/src/components/TaskForm';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { useAppData } from '@/src/data/useAppData';
import type { AppSettings } from '@/src/domain/models';

const toggles = [
  ['raiseMissedTasksToHigh', 'Raise missed tasks to High'],
  ['preserveOriginalDueDate', 'Preserve original due date'],
  ['addRolloverCount', 'Count rollovers'],
  ['moveIncompleteTasksToNextDay', 'Move incomplete tasks to next day'],
] as const;

export default function SettingsScreen() {
  const { label: accountLabel } = useAccount();
  const { colors, settings, updateSetting, ready } = useAppTheme();
  const { error: storageError, resetVersion } = useAppData();
  const [timeDraft, setTime] = useState<string>();
  const time = timeDraft ?? settings.rolloverTime;
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [seenReset, setSeenReset] = useState(resetVersion);
  if (seenReset !== resetVersion) { setSeenReset(resetVersion); setTime(undefined); setError(''); }
  const save = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSaving(true); setError('');
    try { await updateSetting(key, value); if (key === 'rolloverTime') setTime(undefined); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save settings.'); }
    finally { setSaving(false); }
  };
  if (!ready) return <Page title="Settings" subtitle={storageError || 'Loading settings…'} />;
  return <Page title="Settings" subtitle="Shape how LifeCommand fits your day.">
    {error || storageError ? <FormError>{error || storageError}</FormError> : null}
    <Label style={{ fontSize: 20, fontWeight: '700' }}>Account and data</Label>
    <Muted>Active: {accountLabel}</Muted>
    <AutomaticSyncCard /><CloudSyncCard disabled={saving} />
    <DataManagementCard saving={saving} onReset={() => { setTime(undefined); setError(''); }} />
    <Label style={{ fontSize: 20, fontWeight: '700' }}>Calendars</Label>
    <Muted>External calendar refresh is separate from LifeCommand task and project sync.</Muted>
    <CalendarSyncCard />
    <Label style={{ fontSize: 20, fontWeight: '700' }}>Account planning preferences</Label>
    <PersonalizationSettings mode="sections" /><RecurrenceSettings /><DayPlanningSettings />
    <Card title="Daily rollover">
      <Muted>At this local time, unfinished work from the previous day moves forward. If the app is closed, it catches up when you return.</Muted>
      <Label>Rollover time · 24-hour HH:MM</Label>
      <Row><TextInput accessibilityLabel="Rollover time, 24-hour HH:MM" value={time} onChangeText={setTime} placeholder="00:00" placeholderTextColor={colors.muted} maxLength={5} autoCorrect={false} style={{ flex: 1, minHeight: 44, color: colors.text, backgroundColor: colors.background, padding: 12, borderRadius: 10 }} /><Pressable disabled={saving} accessibilityRole="button" onPress={() => void save('rolloverTime', time.trim())} style={{ padding: 12 }}><Label>{saving ? 'Saving…' : 'Save time'}</Label></Pressable></Row>
      <Muted>Saved: {settings.rolloverTime === '00:00' ? '12:00 AM (midnight)' : settings.rolloverTime}</Muted>
      {toggles.map(([key, label]) => <Row key={key}><View style={{ flex: 1 }}><Label>{label}</Label></View><Switch accessibilityLabel={label} disabled={saving} value={settings[key]} onValueChange={value => void save(key, value)} trackColor={{ true: colors.accent }} /></Row>)}
    </Card>
    <Card title="Defaults"><Row><Label>Default story points</Label><View style={{ flexDirection: 'row', gap: 12 }}><Pressable disabled={saving} accessibilityRole="button" style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Decrease default story points" onPress={() => void save('defaultStoryPoints', Math.max(1, settings.defaultStoryPoints - 1))}><Label>−</Label></Pressable><Label>{settings.defaultStoryPoints}</Label><Pressable disabled={saving} accessibilityRole="button" style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Increase default story points" onPress={() => void save('defaultStoryPoints', Math.min(13, settings.defaultStoryPoints + 1))}><Label>＋</Label></Pressable></View></Row></Card>

    <ReminderSettingsCard key={resetVersion} settings={settings} saving={saving} save={save} />
    <Label style={{ fontSize: 20, fontWeight: '700' }}>This device</Label>
    <PersonalizationSettings mode="appearance" /><TodaySettings />
    <NotificationSettingsCard />
    <AmbientProfiles />
    <AmbientSettingsCard settings={settings} saving={saving} save={save} />

  </Page>;
}
