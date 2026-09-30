import { Pressable, Switch, TextInput, View } from 'react-native';
import { useCalendarSync } from '../calendar/CalendarSyncProvider';
import { config, manualSample } from '../calendar/provider';
import { sourceColors } from '../domain/events';
import { useAppTheme } from '../theme/ThemeProvider';
import { Action } from './TaskScheduling';
import { FormError } from './TaskForm';
import { Card, Label, Muted, Row } from './ui';

const providers = ['google', 'outlook'] as const;
const names = { google: 'Google Calendar', outlook: 'Microsoft Outlook' };
const palette = [{ name: 'Purple', color: '#8962CF' }, { name: 'Blue', color: '#3978C5' }, { name: 'Green', color: '#5E9C70' }, { name: 'Teal', color: '#31A3A0' }, { name: 'Gold', color: '#C7952D' }];
export function CalendarSyncCard() {
  const sync = useCalendarSync();
  const { colors } = useAppTheme();
  return <Card title="Calendar Sync">
    <Label>{sync.busy ? 'Sync in progress…' : sync.cache.accounts.length ? `${sync.cache.accounts.length} connected calendar account${sync.cache.accounts.length === 1 ? '' : 's'}` : providers.some(provider => sync.support[provider].configured) ? 'Signed out / not connected' : 'Not configured'}</Label>
    <Muted>Read-only imports: 30 days back and 90 days ahead. Imported events cannot be edited here. Cached events stay available offline.</Muted>
    {providers.map(provider => <View key={provider} style={{ gap: 8 }}>
      <Action label={`Connect ${names[provider]}`} disabled={sync.busy || !sync.ready || !sync.authReady[provider]} onPress={() => void sync.connectProvider(provider)} />
      {!sync.support[provider].configured ? <Muted>{sync.support[provider].reason}</Muted> : !sync.authReady[provider] && !sync.authError[provider] ? <Muted>Loading {names[provider]} sign-in…</Muted> : null}
      {sync.authError[provider] ? <><FormError>{sync.authError[provider]}</FormError><Action label={`Retry loading ${names[provider]} sign-in`} disabled={sync.busy} onPress={() => void sync.prepare(provider)} /></> : null}
    </View>)}
    <Muted>Add multiple accounts with Connect. Reconnect an account after restarting the app or when authorization expires, then use Sync now.</Muted>
    {sync.cache.accounts.map(account => <View key={account.id} testID={`calendar-account-${account.id}`} style={{ gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.soft }}>
      <Label>{account.label}</Label>
      <Muted>{sync.activeAccount === account.id ? 'Sync in progress…' : sync.needsReconnect[account.id] ? 'Reconnect required' : `Connected · ${account.mode === 'manual' ? 'manual test provider' : names[account.provider]}`}</Muted>
      <Muted>{account.lastSyncedAt ? `Last synced: ${new Date(account.lastSyncedAt).toLocaleString()}` : 'Not synced yet'}</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Action label="Sync now" disabled={sync.busy || !sync.ready || (account.mode === 'manual' ? !config.manualEnabled : !sync.support[account.provider].configured)} onPress={() => void sync.sync(account.id)} />
        {account.mode !== 'manual' ? <Action label={`Reconnect ${names[account.provider]}`} disabled={sync.busy || !sync.ready || !sync.authReady[account.provider]} onPress={() => void sync.connectProvider(account.provider, account.id)} /> : null}
        <Action label="Disconnect" disabled={sync.busy || !sync.ready} onPress={() => void sync.disconnect(account.id)} />
      </View>
      {sync.accountErrors[account.id] ? <FormError>{sync.accountErrors[account.id]}</FormError> : null}
      {sync.cache.calendars.filter(calendar => calendar.accountId === account.id).map(calendar => <View key={calendar.id} style={{ gap: 4, paddingLeft: 10, borderLeftWidth: 4, borderLeftColor: calendar.colorOverride ?? calendar.color ?? sourceColors[account.provider] }}>
        <Row><View style={{ flex: 1 }}><Label>{calendar.name}</Label></View><Switch accessibilityLabel={`Import calendar: ${calendar.name}`} value={calendar.syncEnabled} disabled={sync.busy} onValueChange={value => void sync.updateCalendar(account.id, calendar.id, { syncEnabled: value })} /></Row>
        <Row><View style={{ flex: 1 }}><Muted>Show in Family mode</Muted></View><Switch accessibilityLabel={`Family calendar: ${calendar.name}`} value={!!calendar.family} disabled={sync.busy} onValueChange={value => void sync.updateCalendar(account.id, calendar.id, { family: value })} /></Row>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
          {palette.map(option => <Pressable key={option.color} accessibilityRole="radio" accessibilityLabel={`${calendar.name} color: ${option.name}`} accessibilityState={{ checked: calendar.colorOverride === option.color, disabled: sync.busy }} disabled={sync.busy} onPress={() => void sync.updateCalendar(account.id, calendar.id, { colorOverride: option.color })} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: calendar.colorOverride === option.color ? 2 : 0, borderColor: colors.text }}><View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: option.color }} /></Pressable>)}
          {calendar.colorOverride ? <Action label="Use calendar color" disabled={sync.busy} onPress={() => void sync.updateCalendar(account.id, calendar.id, { colorOverride: undefined })} /> : null}
        </View>
      </View>)}
    </View>)}
    {sync.cache.accounts.length ? <>
      <Muted>Disabled calendars are hidden and not refreshed. After enabling one, use Sync now. Disconnect removes only that account’s imported events.</Muted>
      <Muted>Google family and shared calendars appear when they are in your Google calendar list and you have permission to read events. Enable Family mode for the calendars your household uses.</Muted>
    </> : null}
    {config.manualEnabled ? <View style={{ gap: 8 }}>
      <Label>Manual provider test harness</Label><Muted>Sample JSON only. Sync replaces the manual account’s snapshot. Use [] to test deletion.</Muted>
      {!sync.cache.accounts.some(account => account.mode === 'manual') ? <Action label="Connect manual test calendar" disabled={sync.busy || !sync.ready} onPress={() => void sync.connect()} /> : null}
      <TextInput accessibilityLabel="Manual calendar snapshot JSON" multiline value={sync.manualJSON} onChangeText={sync.setManualJSON} editable={!sync.busy} autoCapitalize="none" autoCorrect={false} style={{ minHeight: 140, maxHeight: 250, padding: 12, borderRadius: 10, color: colors.text, backgroundColor: colors.background }} />
      <Action label="Load sample snapshot" disabled={sync.busy} onPress={() => sync.setManualJSON(manualSample())} />
    </View> : null}
    {sync.error ? <><FormError>{sync.error}</FormError><Action label="Retry Calendar Sync" disabled={sync.busy} onPress={() => void sync.reload()} /></> : null}
    {sync.error && (!sync.ready || !sync.cache.accounts.length) ? <Action label="Disconnect and clear imported cache" disabled={sync.busy} onPress={() => void sync.clearInvalidCache()} /> : null}
  </Card>;
}
