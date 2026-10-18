import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCalendarSync } from '../calendar/CalendarSyncProvider';
import { Action } from './Action';
import { Card, Muted } from './ui';
import { FormError } from './TaskForm';
export function LiveCalendarStatus({ from, through }: { from: string; through: string }) {
  const { live } = useCalendarSync().subscriptions;
  const refresh = useRef(live.refresh);
  useEffect(() => { refresh.current = live.refresh; }, [live.refresh]);
  useFocusEffect(useCallback(() => {
    const run = () => { void refresh.current(true).catch(() => undefined); };
    run(); const listener = AppState.addEventListener('change', state => { if (state === 'active') run(); });
    return () => listener.remove();
  }, []));
  if (!live.calendars.length && !live.error) return null;
  return <Card title="Calendar subscriptions · read-only">
    <Action label="Refresh calendar subscriptions" text={live.busy ? 'Updating calendars…' : 'Refresh calendars'} disabled={live.busy || !live.available} onPress={() => void live.refresh().catch(() => undefined)} />
    {live.error ? <FormError>{live.error}</FormError> : null}
    {live.calendars.filter(calendar => calendar.visible).map(calendar => <Muted key={calendar.id}>
      {calendar.name}: {calendar.error ? 'Update failed · showing cached events' : calendar.events.length ? 'Cached events' : 'Connected · no events in cached range'}.
      {' '}Updated {calendar.lastSuccess ? new Date(calendar.lastSuccess).toLocaleString() : 'never'}.
      {' '}Coverage {calendar.coverage.from} to {calendar.coverage.through}.
      {from < calendar.coverage.from || through > calendar.coverage.through ? ' This view extends beyond cached coverage; events outside that range are unavailable.' : ''}
    </Muted>)}
  </Card>;
}
