import { useRef, useState } from 'react';
import { useCalendarSync } from '../calendar/CalendarSyncProvider';
import { fetchSubscriptionFeed } from '../calendar/subscriptionGateway';
import { useAppTheme } from '../theme/ThemeProvider';
import { SettingsDialog } from './SettingsDialog';
import { AppTextInput } from './AppText';
import { Action } from './Action';
import { Card, Label, Muted, Row } from './ui';
import { FormError } from './TaskForm';
export function SubscriptionSettings() {
  const { subscriptions } = useCalendarSync(), { colors } = useAppTheme();
  const [open, setOpen] = useState(false), [name, setName] = useState(''), [url, setURL] = useState(''), [color, setColor] = useState('#557D78');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [discard, setDiscard] = useState(false), [disconnect, setDisconnect] = useState<string>();
  const running = useRef(false);
  const close = () => { if (busy) return; if (name || url) setDiscard(true); else setOpen(false); };
  const abandon = () => { setURL(''); setName(''); setError(''); setDiscard(false); setOpen(false); };
  const preview = async () => {
    if (running.current) return;
    if (!name.trim()) { setError('Enter a display name.'); return; }
    running.current = true; setBusy(true); setError('');
    try { await fetchSubscriptionFeed(url); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Feed preview unavailable. Your previous events were kept.'); }
    finally { running.current = false; setBusy(false); }
  };
  const input = { minHeight: 48, padding: 12, borderRadius: 10, color: colors.text, backgroundColor: colors.background };
  return <Card title="Calendar subscriptions · read-only">
    <Muted>ICS subscriptions are being prepared. A secure feed service is required before this build can preview or save a URL. Availability also depends on your provider’s and organization’s sharing policies.</Muted>
    <Action label="Add calendar subscription" onPress={() => setOpen(true)} />
    {subscriptions.error ? <FormError>{subscriptions.error}</FormError> : null}
    {subscriptions.cache.subscriptions.map(subscription => <Card key={subscription.id} title={subscription.name}><Muted>{subscription.lastSuccess ? `Last successful refresh: ${new Date(subscription.lastSuccess).toLocaleString()}` : 'Not refreshed'} · cached, read-only</Muted><Muted>Refresh unavailable until the secure feed service is configured. Cached events are preserved.</Muted><Action label={`Disconnect subscription ${subscription.name}`} danger onPress={() => setDisconnect(subscription.id)} /></Card>)}
    {disconnect ? <SettingsDialog title="Disconnect subscription?" onClose={() => setDisconnect(undefined)} footer={<Row><Action label="Cancel disconnect" onPress={() => setDisconnect(undefined)} /><Action label="Confirm disconnect subscription" danger onPress={() => void subscriptions.disconnect(disconnect).then(() => setDisconnect(undefined)).catch(() => setError('Could not disconnect. Retry.'))} /></Row>}><Muted>Only this subscription and its cached events are removed. Tasks and other calendar connections are kept.</Muted>{error ? <FormError>{error}</FormError> : null}</SettingsDialog> : null}
    {open ? <SettingsDialog title={discard ? 'Discard subscription draft?' : 'Add calendar subscription'} onClose={close} footer={discard ? <Row><Action label="Keep subscription draft" onPress={() => setDiscard(false)} /><Action label="Discard subscription draft" danger onPress={abandon} /></Row> : <Row><Action label="Cancel subscription" disabled={busy} onPress={close} /><Action label={busy ? 'Previewing…' : 'Preview calendar'} primary disabled={busy} onPress={() => void preview()} /></Row>}>
      {discard ? <Muted>This unsaved name and URL will be discarded.</Muted> : <><Label>Display name</Label><AppTextInput accessibilityLabel="Subscription display name" value={name} editable={!busy} onChangeText={setName} style={input} /><Label>Private subscription URL</Label><AppTextInput accessibilityLabel="Private calendar subscription URL" value={url} editable={!busy} onChangeText={setURL} autoCapitalize="none" autoCorrect={false} secureTextEntry style={input} /><Muted>Treat this address like a password. It is not included in exports or diagnostics.</Muted><Label>Source color</Label><Row>{['#557D78', '#3978C5', '#8962CF', '#B94F35'].map(value => <Action key={value} label={`Subscription color ${value}`} text={`${color === value ? '✓ ' : ''}${value}`} onPress={() => setColor(value)} />)}</Row>{error ? <FormError>{error}</FormError> : null}</>}
    </SettingsDialog> : null}
  </Card>;
}
