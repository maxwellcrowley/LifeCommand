import { validateFeedURL } from '../domain/ics';
// Deliberately fail closed: there is no deployed/verified authenticated ICS gateway
// in this repository. Do not replace this with fetch(url), a CORS proxy, or an
// arbitrary Supabase function call. See docs/integrations/ICS_SUBSCRIPTIONS.md.
export async function fetchSubscriptionFeed(url: string): Promise<string> {
  validateFeedURL(url);
  throw Error('Calendar subscriptions need a secure feed service, which is not available in this build. Google and Outlook connections remain available. No subscription was saved.');
}
