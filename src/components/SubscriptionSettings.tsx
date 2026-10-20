import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useCalendarSync } from '../calendar/CalendarSyncProvider';
import type { LiveCalendar } from '../calendar/liveIcsClient';
import { useAppTheme } from '../theme/ThemeProvider';
import { SettingsDialog } from './SettingsDialog';
import { AppTextInput } from './AppText';
import { Action } from './Action';
import { Card, Label, Muted, Row } from './ui';
import { FormError } from './TaskForm';

export function SubscriptionSettings() {
  const { subscriptions } = useCalendarSync(), { colors } = useAppTheme(), { live } = subscriptions;
  const [editor, setEditor] = useState<{ id: string; original?: LiveCalendar; replacing?: boolean }>();
  const [name, setName] = useState(''), [url, setURL] = useState(''), [color, setColor] = useState('#557D78');
  const [error, setError] = useState(''), [discard, setDiscard] = useState(false), [menu, setMenu] = useState<string>();
  const [disconnect, setDisconnect] = useState<{ id: string; name: string; legacy?: boolean }>();
  const running = useRef(false), focus = useRef<View>(null);
  const reload = useRef(live.reload);
  useEffect(() => { reload.current = live.reload; }, [live.reload]);
  useEffect(() => { void reload.current().catch(() => undefined); }, []);
  const edit = (original?: LiveCalendar, replacing = false) => {
    setName(original?.name ?? ''); setColor(original?.color ?? '#557D78'); setURL(''); setError(''); setMenu(undefined);
    setEditor({ id: original?.id ?? randomUUID(), original, replacing });
  };
  const abandon = () => { setURL(''); setName(''); setError(''); setDiscard(false); setEditor(undefined); };
  const manage = async (operation: () => Promise<void>) => {
    if (running.current || live.busy) return; running.current = true; setError('');
    try { await operation(); setMenu(undefined); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Please retry.'); }
    finally { running.current = false; }
  };
  const save = () => manage(async () => {
    if (!editor) return;
    if (!name.trim() || name.trim().length > 80) throw Error('Enter a calendar name up to 80 characters.');
    if ((!editor.original || editor.replacing) && !url.trim()) throw Error('Enter the private calendar subscription URL.');
    if (!editor.original) await live.mutate('', 'POST', { id: editor.id, name, color, url: url.trim() });
    else if (editor.replacing) await live.mutate(`/${editor.id}/replace`, 'POST', { url: url.trim(), revision: editor.original.revision });
    else await live.mutate(`/${editor.id}`, 'PATCH', { name, color, visible: editor.original.visible, revision: editor.original.revision });
    abandon();
  });
  const input = { minHeight: 48, padding: 12, borderRadius: 10, color: colors.text, backgroundColor: colors.background };
  return <View ref={focus} tabIndex={-1}><Card title="Connected calendars">
    <Muted>Subscriptions are read-only. Updates depend on your provider publishing them. They never become tasks or reminders.</Muted>
    {!live.available ? <Muted>{live.unavailable} Existing local calendars remain available.</Muted> : <Row><Action label="Connect calendar" primary disabled={live.busy} onPress={() => edit()} /><Action label="Refresh connected calendars" text={live.busy ? 'Updating…' : 'Refresh'} disabled={live.busy} onPress={() => void manage(() => live.refresh())} /></Row>}
    {live.error || error || subscriptions.error ? <FormError>{error || live.error || subscriptions.error}</FormError> : null}
    {live.calendars.map(calendar => <View key={calendar.id} style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 10, gap: 4 }}>
      <Row><View accessible={false} style={{ backgroundColor: calendar.color, width: 12, height: 12, borderRadius: 6 }} /><Label>{calendar.name} · {calendar.visible ? 'Shown' : 'Hidden'}</Label><Action label={`Manage calendar ${calendar.name}`} text="Manage" expanded={menu === calendar.id} disabled={live.busy} onPress={() => { setError(''); setMenu(menu === calendar.id ? undefined : calendar.id); }} /></Row>
      <Muted>{calendar.hostname} · {calendar.lastSuccess ? `Updated ${new Date(calendar.lastSuccess).toLocaleString()}` : 'No successful update'}</Muted>
      {calendar.error ? <FormError>{`${calendar.error} Cached events may be out of date.`}</FormError> : <Muted>{calendar.events.length ? `${calendar.events.length} cached events` : 'Connected · no events in the cached date range'}</Muted>}
      {menu === calendar.id ? <Row><Action label={`Edit calendar ${calendar.name}`} text="Name and color" onPress={() => edit(calendar)} /><Action label={`Replace URL for ${calendar.name}`} text="Replace calendar URL" onPress={() => edit(calendar, true)} /><Action label={`${calendar.visible ? 'Hide' : 'Show'} calendar ${calendar.name}`} text={calendar.visible ? 'Hide calendar' : 'Show calendar'} onPress={() => void manage(() => live.mutate(`/${calendar.id}`, 'PATCH', { name: calendar.name, color: calendar.color, visible: !calendar.visible, revision: calendar.revision }))} /><Action label={`Disconnect ${calendar.name}`} text="Disconnect" danger onPress={() => { setMenu(undefined); setError(''); setDisconnect(calendar); }} /></Row> : null}
    </View>)}
    {subscriptions.cache.subscriptions.map(calendar => <View key={calendar.id}><Label>{calendar.name} · legacy device cache</Label><Muted>Reconnect explicitly to enable live updates. Imported backups never connect automatically.</Muted><Action label={`Remove legacy calendar ${calendar.name}`} text="Remove cached calendar" onPress={() => setDisconnect({ ...calendar, legacy: true })} /></View>)}
    {disconnect ? <SettingsDialog title={`Disconnect ${disconnect.name}?`} returnFocusRef={focus} onClose={() => { if (!live.busy) setDisconnect(undefined); }} footer={<Row><Action label="Cancel disconnect" disabled={live.busy} onPress={() => setDisconnect(undefined)} /><Action label={live.busy ? 'Disconnecting…' : 'Confirm disconnect'} danger disabled={live.busy} onPress={() => void manage(async () => { if (disconnect.legacy) await subscriptions.disconnect(disconnect.id); else await live.mutate(`/${disconnect.id}`, 'DELETE'); setDisconnect(undefined); })} /></Row>}><Muted>LifeCommand removes this connection and its cached events. The source calendar is not deleted. Other devices update when they next connect.</Muted>{error ? <FormError>{error}</FormError> : null}</SettingsDialog> : null}
    {editor ? <SettingsDialog title={discard ? 'Discard calendar draft?' : editor.replacing ? 'Replace calendar URL' : editor.original ? 'Edit connected calendar' : 'Connect calendar'} returnFocusRef={focus} onClose={() => { if (!live.busy) setDiscard(true); }} footer={discard ? <Row><Action label="Keep calendar draft" onPress={() => setDiscard(false)} /><Action label="Discard calendar draft" danger onPress={abandon} /></Row> : <Row><Action label="Cancel calendar editing" disabled={live.busy} onPress={() => setDiscard(true)} /><Action label={live.busy ? 'Connecting…' : editor.original ? 'Save calendar' : 'Connect'} primary disabled={live.busy} onPress={() => void save()} /></Row>}>
      {discard ? <Muted>The unsaved draft will be discarded. Drafts are retained only while this editor stays open.</Muted> : <>
        {!editor.replacing ? <><Label>Calendar name</Label><AppTextInput accessibilityLabel="Calendar name" value={name} maxLength={80} editable={!live.busy} onChangeText={setName} style={input} /></> : <Muted>{name} · {editor.original?.hostname}. A failed replacement keeps the current connection and events.</Muted>}
        {!editor.original || editor.replacing ? <><Label>Subscription URL</Label><AppTextInput accessibilityLabel="Private calendar subscription URL" value={url} editable={!live.busy} onChangeText={setURL} autoCapitalize="none" autoCorrect={false} secureTextEntry maxLength={4096} style={input} /><Muted>Treat this address like a password. Stored URLs cannot be displayed. Do not include it in screenshots or support messages.</Muted></> : <Muted>{editor.original.hostname} · Use Replace calendar URL to change the private address.</Muted>}
        {!editor.replacing ? <><Label>Color</Label><Row>{['#557D78', '#3978C5', '#8962CF', '#B94F35'].map((value, index) => <Action key={value} label={`${['Teal', 'Blue', 'Purple', 'Orange'][index]} calendar color${color === value ? ', selected' : ''}`} text={`${color === value ? '✓ ' : ''}${['Teal', 'Blue', 'Purple', 'Orange'][index]}`} disabled={live.busy} onPress={() => setColor(value)} />)}</Row></> : null}
        <Muted>Cached coverage: approximately 31 days back and 91 days ahead. Timed events require UTC (Z) or a supported timezone with embedded definitions. Floating event times are not supported. Unsupported feeds are rejected without clearing valid events.</Muted>
        {error ? <FormError>{error}</FormError> : null}
      </>}
    </SettingsDialog> : null}
  </Card></View>;
}
