import { useState } from 'react';
import { Card, Muted } from './ui';
import { Disclosure } from './Disclosure';
import { Action } from './Action';
import { Onboarding } from './Onboarding';
export function HelpSettings() {
  const [setup, setSetup] = useState(false);
  return <Card><Disclosure title="Help" summary="A quick guide and optional setup" storageKey="Settings:help" defaultCollapsed>
    <Muted>Focus Today: explicitly pin up to your chosen limit of incomplete tasks scheduled today. Pins do not change dates or priorities. Completed or rescheduled tasks leave the active focus area.</Muted>
    <Muted>Planning: Add from backlog shows your chosen day alongside available tasks. Filtering and collapsing keep selections. Scheduling saves all selected tasks together or none; a stale item needs attention before retrying.</Muted>
    <Muted>Rollover: missed tasks follow your scheduling preferences when the app next opens or becomes active. Review’s postponement history starts when recorded by this version; manual postponements and automatic rollovers are separate.</Muted>
    <Muted>Saved views: Search can remember combinations of task filters. Definitions sync with your account, while the active view and display preferences stay on this device for this account. Calendar events only follow search text.</Muted>
    <Muted>Read-only events: imported appointments are edited at their calendar provider. Hiding one here does not delete it there. Sync failures keep the last successful calendar cache.</Muted>
    <Action label="Reopen optional setup" onPress={() => setSetup(true)} />
  </Disclosure>{setup ? <Onboarding replay onClose={() => setSetup(false)} /> : null}</Card>;
}
