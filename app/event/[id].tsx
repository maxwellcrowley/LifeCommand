import { Link, useLocalSearchParams } from 'expo-router';
import { EventEditor } from '@/src/components/EventEditor';
import { Label, Page } from '@/src/components/ui';
import { useAppData } from '@/src/data/useAppData';
import { findEvent } from '@/src/domain/events';

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, resetVersion } = useAppData();
  if (!data) return <Page title="Event" subtitle={error || 'Loading your calendar…'} />;
  const event = findEvent(data, id);
  if (!event || event.archivedAt) return <Page title="Event unavailable" subtitle="This event was archived or could not be found."><Link href="/(tabs)/calendar"><Label>Back to Calendar</Label></Link></Page>;
  return <EventEditor key={`${id}:${resetVersion}`} event={event} />;
}
