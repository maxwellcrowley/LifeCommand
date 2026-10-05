import { useAccount } from '../cloud/AccountBoundary';
import { useAutomaticSync } from '../cloud/AutomaticSyncProvider';
import { Muted } from './ui';

/** Shown inside the confirmation, so its destination remains visible while deciding. */
export function DataDestination() {
  const { label, userId } = useAccount();
  const { enabled } = useAutomaticSync();
  return <><Muted>Destination: {userId ? `${label} on this device` : label}.</Muted>
    {userId ? <Muted>Guest data and other accounts stay separate.{enabled ? ' Automatic LifeCommand sync is enabled: this change can replace the account’s cloud copy and reach other devices.' : 'Automatic LifeCommand sync is off. The cloud copy is unchanged until you upload.'}</Muted> : null}</>;
}
