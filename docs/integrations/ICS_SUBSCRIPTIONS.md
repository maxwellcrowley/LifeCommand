# ICS subscriptions — foundation history

Update (2026-10-18): the live service and app workflow are implemented on `feature/live-ics`.
See [implementation/deployment](../LIVE_ICS_IMPLEMENTATION.md) and
[current acceptance evidence](../LIVE_ICS_ACCEPTANCE.md). Hosted deployment is still
required. The section below records the earlier foundation state, not the current
implementation. Legacy device caches remain available without automatic fetching.

Status (2026-10-10): **not a working live calendar connection yet**. Settings exposes a private URL/name/color draft and explains the unavailable secure service. Preview fails closed; it does not fetch the URL or save a connection. Do not advertise live ICS support in store copy.

## Implemented and verified with isolated fixtures

- `ical.js` 2.2.1, installed through `npx expo install ical.js`; lazy loading avoids startup cost. [Upstream parser](https://github.com/kewisch/ical.js), [component-local timezone API](https://kewisch.github.io/ical.js/api/ICAL.Component.html).
- UTC, floating local times, all-day exclusive end dates, embedded VTIMEZONE/DST, RRULE, EXDATE, moved exceptions, canceled instances, revision precedence and stable UID/original-occurrence identity.
- Maximum 2 MiB feed, 10,000 components and 20,000 expanded occurrences. Expansion is bounded to the established 30-days-back / 90-days-forward sync window supplied by the caller.
- Complete snapshot replacement removes omitted events and preserves hide overrides. Failed parsing/writes do not replace the previous snapshot. Account-scoped subscription cache, cross-tab write lock and compare-and-swap reject stale refresh results.
- ICS event source is separate from Google/Outlook auth. Existing provider credential types/storage and OAuth configuration are unchanged. Display events integrate with Today, Calendar, planner, Search and Ambient as read-only; hide/unhide delegates to the subscription cache.
- URL is a password-style draft only, never persisted, logged, included in ordinary exports, or screenshotted. Cache records whitelist their fields. No live feed was contacted.

## Exact external blocker

The repository has a Supabase client and SQL snapshot contract but no authorized, deployed and verified feed-fetch endpoint or egress policy. `subscriptionGateway.ts` deliberately rejects requests. There is no generic proxy and no assumption that CORS can be bypassed safely from the client. Backend deployment was not authorized by this task.

Before enabling Preview → Save → Refresh, provide an authenticated account-bound service on the existing backend with:

1. Server-side URL validation: HTTPS only; no credentials, fragments, alternate ports or IP literals; validate every redirect (prefer rejecting all redirects).
2. DNS resolution and connection-level enforcement against loopback, RFC1918, link-local/metadata, IPv6 private/reserved/mapped ranges and DNS rebinding. A hostname regex/client validator alone is not protection. Prefer an audited allowlist plus enforced egress controls.
3. A request deadline, response/decompression byte limits, content validation, per-account rate limits and bounded parsing. No raw provider error/body/URL logging, tracing, analytics or request-body capture.
4. Secure URL storage separate from snapshots/exports (native existing SecureStore, web memory-only or an account-encrypted server secret), authenticated ownership checks on every refresh/disconnect, and no service-role secrets in client bundles.
5. A documented complete-snapshot response contract and tests for redirects, private-address resolution/rebinding, timeout, oversize, auth isolation, revocation, stale failure status, reconnect/re-enter URL, and deletion of feed secrets.

The Save/manual-refresh workflow and secret persistence are intentionally **not enabled** until that boundary exists. Cached fixture rows support hide/unhide and confirmed disconnect; production subscriptions cannot yet be created.

## Known parser limitations

Named TZIDs require the feed's VTIMEZONE definition; no bundled IANA database is assumed. Unsupported zones, orphan exceptions, excessive recurrence history, moved-in exceptions beyond the expansion boundary, and zero-duration timed events reject the complete snapshot rather than silently losing/changing events. These cases need additional fixtures/support before general availability. There is no live provider or physical-device ICS verification.

Provider/organization sharing policy determines whether an ICS feed is available. This feature must not be described as a way around organizational restrictions.
