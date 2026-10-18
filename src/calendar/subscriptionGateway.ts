import { validateFeedURL } from '../domain/ics';
// Legacy raw-feed API remains forbidden on clients. Live subscriptions use
// liveIcsClient's authenticated connection/snapshot API instead; only the Node
// service may fetch provider URLs. Retained as a regression guard against
// accidentally reintroducing device/browser direct downloads.
export async function fetchSubscriptionFeed(url: string): Promise<string> {
  validateFeedURL(url);
  throw Error('Direct feed downloads are unavailable. Use Connected calendars and its secure feed service. No subscription was saved.');
}
