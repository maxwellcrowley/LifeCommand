import { useLocalSearchParams } from 'expo-router';
import { EventEditor } from '@/src/components/EventEditor';
import { Page } from '@/src/components/ui';
import { useAppData } from '@/src/data/useAppData';
import { isDateKey } from '@/src/domain/dates';

export default function NewEventScreen() {
  const { data, error } = useAppData();
  const { date } = useLocalSearchParams<{ date?: string }>();
  if (!data) return <Page title="New event" subtitle={error || 'Loading your calendar…'} />;
  return <EventEditor initialDate={typeof date === 'string' && isDateKey(date) ? date : undefined} />;
}
