# Live ICS subscriptions

Implemented on `feature/live-ics`, based on fetched master `223a5124eb9b036f172060c744560eda566d2c1a`. The Android acceptance branch was not merged. **Not yet operational in a hosted build:** deployment, hosted authentication/RLS smoke testing, and device acceptance are still required. See [acceptance evidence](LIVE_ICS_ACCEPTANCE.md).

## Application contract

Settings → Accounts and connections → Connected calendars supports Connect, name/color editing, show/hide, explicit URL replacement, refresh, and confirmed disconnect. The existing dialog supplies scrolling, keyboard avoidance, safe-area padding and web modal containment. Failed drafts remain only while the editor is mounted. Connect is acknowledged only after a complete validated initial snapshot is persisted. A stable draft UUID makes a retried create idempotent.

Calendar displays these events through the existing read-only external-event layout, including source name and color. It loads the account's cached snapshot first, checks server metadata on Calendar focus/foreground, and refreshes feeds no more often than the 15-minute automatic freshness interval. Opening Settings reconciles metadata/removals without fetching provider feeds. Manual refresh is server-throttled. Status separates last attempt from last success; valid empty feeds are connected/empty, not failed. Coverage is explicit: UTC today minus 31 through plus 91 days at the last successful snapshot. Views outside coverage warn rather than implying an empty calendar.

Subscription events never enter task/project/recurrence/Focus state and never schedule imported alarms. Google/Outlook adapters, OAuth callbacks, app identifiers and EAS configuration are unchanged. Hide/show calendar visibility is account-wide; individual Hide event remains the existing device preference.

## Backend and transport decision

`backend/live-ics` is a separate Node 24 service, with its own lockfile. No application dependency changed. It uses PostgreSQL in the existing Supabase project and verifies each bearer token against that project's `/auth/v1/user`; a client-supplied owner ID is never used. There is no unauthenticated proxy or URL-reveal operation.

Node HTTPS was selected instead of ordinary Edge `fetch`: it exposes connection-time `lookup`, TLS hostname verification, explicit agents, stream cancellation and timeouts. Each request resolves A/AAAA once, rejects **all** answers if any are nonpublic, and supplies only the validated address to the socket's lookup callback. The original hostname remains the TLS/Host identity. A per-request agent disables pooling/proxy environment and TLS session caching. Redirects are manual, with every destination independently validated. HTTPS-to-HTTP, URL credentials, fragments, unsupported ports, malformed/alternate private IPs, mapped/transition IPv6 and reserved networks are rejected. No app authorization header/cookie is sent upstream.

Primary references consulted: [Node 24 HTTPS](https://nodejs.org/download/release/v24.16.0/docs/api/https.html), [DNS Resolver cancellation](https://nodejs.org/docs/latest-v24.x/api/dns.html), [stream pipeline](https://nodejs.org/api/stream.html), [authenticated encryption](https://nodejs.org/docs/latest-v24.x/api/crypto.html), [Supabase authenticated getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [ical.js Event](https://kewisch.github.io/ical.js/api/ICAL.Event.html), [Expo 57 Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/), [React Native 0.86 AppState](https://reactnative.dev/docs/0.86/appstate).

Executable transport tests use a TLS server bound to test-owned loopback port 443, a generated one-day certificate, and injected resolver/address policy. They exercise the actual HTTPS socket and streams, certificate rejection, single-resolution pinning, redirect rejection, compressed/decompressed limits, and timeout destruction. A separate assertion uses the **production** address policy and proves no socket reaches that fixture. The injection is a module testing seam, not a server option or environment bypass. No private service or metadata endpoint is probed. Hosted routing/egress must still be checked after deployment.

### Bounds

| Resource | Limit / enforcement |
|---|---|
| Submitted URL / API body | 4,096 characters / 8 KiB |
| Provider redirects | 3; HTTPS port 443 only |
| DNS / connect / idle / overall fetch | 3 / 5 / 5 / 20 seconds; abort destroys work |
| Combined fetch/retry/parser work | 28-second shared abort deadline |
| Compressed and decoded feed | 2 MiB each, streaming counters; gzip/deflate/identity only |
| Parser | separate process, 3-second external watchdog, 96 MiB JS heap, UTC environment |
| Components / recurrence iterations / published events | 10,000 / 20,000 / 5,000 |
| Published snapshot | 2 MiB serialized events |
| Owner connections / outbound attempts | 10 / 10 per minute, database enforced |
| Owner API requests | 120 per minute, database enforced |
| Concurrent provider work | 16 database lease slots across instances; 64 HTTP requests per instance |
| Lease / manual cooldown | 40 seconds / 60 seconds |
| Failure backoff | exponential 60 seconds to 1 hour |

Limits are named in `transport.mjs`, `parser.mjs`, `ics.ts`, `service.mjs` and the migration. Changing them requires review/tests and coordinated database slot changes; they are deliberately not remotely user-configurable. Reverse proxy limits must be at least as restrictive for ingress. Container memory/pid limits additionally bound parser processes. If a lease expires, a new token can take over; old work cannot publish. Disconnect cascades secrets/cache removal and records a private idempotency tombstone. Failed first connections are not listed; abandoned initial leases are collected on later creation.

Refresh captures owner, connection, generation and lease. Publishing checks them in a row-lock transaction and atomically replaces events, validators, secret and success metadata. URL replacement validates before switching, keeps the prior cache/secret on failure, and uses a new generation. Active/cooldown work can require retry before replacement. An older worker cannot overwrite or resurrect anything. ETag/Last-Modified are private; conditional headers are omitted when coverage changes and on redirects. A 304 is useful only with the corresponding cache/coverage; otherwise an unconditional retry must return a valid snapshot. Failure never clears the last good snapshot; a valid empty VCALENDAR may do so.

## Calendar semantics and supported formats

The existing `ical.js` 2.2.1 parser is reused by the app tests and backend worker. It handles folded/escaped text, UTC, floating **UTC on the server**, all-day exclusive DTEND, multiday intervals, embedded VTIMEZONE/DST, RRULE, RDATE, EXDATE, detached instances, cancellations, and SEQUENCE/DTSTAMP revisions. Identity remains connection + UID + original recurrence identity across moved instances.

The new envelope check rejects truncated/mismatched components, which ical.js can otherwise tolerate. Calendars require exactly one VERSION:2.0 and either no METHOD or METHOD:PUBLISH; invitation/request methods are rejected. Unsupported component types, EXRULE, multiple RRULEs, PERIOD RDATE and recurrence RANGE are rejected rather than silently approximated. Named TZIDs require embedded VTIMEZONE; no IANA database is assumed. Orphan exceptions, excessive recurrence history, moved-in exceptions beyond the expansion boundary, and zero-duration timed events remain rejected. Titles/UIDs are bounded. Descriptions, attachments, HTML, external resource links and VALARM are not imported or executed. This is a deliberately bounded read-only subscription format, not full RFC 5545 support.

## Ownership, secrets, export and recovery

`public.live_ics_connections` has RLS and column-level read grants; authenticated clients can read only their ready rows and cannot mutate them directly. `live_ics_private` has no client-role access. Server operations use the dedicated `live_ics_backend` role (no superuser/BYPASSRLS) and explicitly scope every connection/secret query to the verified owner. Global slots are the only shared work records. Missing and cross-account IDs have the same API outcomes; DELETE is idempotent in either case.

Subscription URLs use Node's AES-256-GCM with a fresh 96-bit nonce, 128-bit tag, and authenticated context `[application, owner, connection, keyVersion]`. Ciphertext/key version are stored in the private schema; keys live in the host's secret manager. Successful refresh re-encrypts with the current version. Rotation: provision old+new keys, switch `LIVE_ICS_KEY_VERSION`, deploy, then run `node scripts/rotate-secrets.mjs` privately. Keep old keys until old rows **and retained database backups** no longer require them. Lost keys require users to replace URLs; do not pretend ciphertext is recoverable without its key. Restoring a database backup must restore the matching key ring and pause refresh traffic during recovery.

The app stores only whitelisted metadata/events under account-scoped `lifecommand:live-ics:v1`; URLs are mounted input drafts only. It cancels requests on account-boundary unmount and checks the session user before sending. Previous account caches cannot target a new account. Ordinary task/project export/import/recovery excludes subscription metadata and secrets. Existing `subscriptions:v1` device caches are retained as legacy read-only data and never auto-connected/fetched. Start Fresh clears this device cache; it does not disconnect server calendars, which return on successful metadata synchronization. Disconnect deletes active server records, not provider calendars or retained database backups; users can separately revoke provider URLs.

## Local verification and development

From the isolated worktree, use Node 24, npm and Docker Desktop (Linux containers). The backend is not an Expo package; its dependencies are installed independently with its checked-in lockfile.

```powershell
npm.cmd ci
Set-Location backend/live-ics
npm.cmd ci
docker compose -p lifecommand-live-ics up -d --wait
npm.cmd test
```

The compose database is loopback-only, disposable tmpfs, with **synthetic** users and fixed local-only credentials. `test/bootstrap.sql` must never run against Supabase. Tests exercise real PostgreSQL/RLS and real parser processes; API identities/feed responses are synthetic. OpenSSL is needed for the transport TLS fixture (Windows default: Git's OpenSSL; set `OPENSSL` if elsewhere). Port 443 must be free on loopback. Do not run the browser and backend database tests concurrently: both intentionally reset only this dedicated database.

Browser build and test (synthetic configuration only, fresh Chrome profile):

```powershell
Set-Location ../..
$env:EXPO_PUBLIC_SUPABASE_URL='https://ics-auth.example.com'
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY='sb_publishable_synthetic_fixture'
$env:EXPO_PUBLIC_LIVE_ICS_URL='https://ics-api.example.com'
npx.cmd expo export --platform web --clear --max-workers 2 --output-dir .test-build/live-ics-web
Set-Location backend/live-ics
node test/browser.mjs
```

The harness intercepts only these synthetic domains, forwards operations to the actual local service/database, and keeps screenshots in `.test-build/live-ics-browser`. It uses observable state/saved rows, not fixed save delays. Do not use this fixture bundle on real accounts. Remove the three temporary process environment values before building a real candidate. The database can be stopped with `docker compose -p lifecommand-live-ics stop`; no existing worktree or backup cleanup is needed.

## Deployment package — authorization required before execution

No hosted target has been selected or deployed. Costs introduced: a small always-available Node container/VM or equivalent container service, TLS ingress, outbound bandwidth, and additional Supabase storage/DB connections. Start with a 2 GiB container, 2 CPU limit, 128 pids and a bounded replica count; measure before distribution. This is not a scheduled job or polling worker.

1. Identify the authorized Supabase project, container host, public HTTPS service origin and permitted web origins. Keep production/test databases separate. Obtain a database backup through the established provider workflow, not a local credential dump.
2. Apply **only** `docs/cloud/migrations/20261018_live_ics.sql` once using the database administrator/migration role. It adds tables/roles/policies and does not alter existing snapshots. Example: `psql "$env:MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/cloud/migrations/20261018_live_ics.sql`. Do not echo that environment value.
3. Create a dedicated LOGIN with an independently generated password through your secret manager/admin console; grant it only membership in `live_ics_backend`. Do not use the postgres login or a Supabase service-role key for the running service. Configure PostgreSQL TLS with certificate verification (`sslmode=verify-full`, trusted CA where required); use a supported direct/session pool connection and cap replicas × 20 connections within the project budget.
4. Provision server-only secrets: `LIVE_ICS_DATABASE_URL`, `LIVE_ICS_KEYS` (JSON key-version to base64 32-byte random key), `LIVE_ICS_KEY_VERSION`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Also configure `LIVE_ICS_ENABLED=true`, `LIVE_ICS_ORIGINS` (exact browser origins), `HOST=0.0.0.0`, `PORT=8787`. No service-role key is required. Generate keys using `crypto.randomBytes(32)` and transfer directly into the secret manager; do not print/store them in ordinary logs. `.env.example` contains names only.
5. Build from repository root: `docker build -f backend/live-ics/Dockerfile -t lifecommand-live-ics:<reviewed-commit> .`. Its allowlisted context excludes local environment files. Run as the image's unprivileged user with read-only root filesystem, 2 GiB memory, 2 CPUs, pid limit 128 and no Docker socket/host networking/mounted credentials beyond the named secrets. Terminate public HTTPS at the approved ingress; expose port 8787 only to that ingress. Forward requests without body logging. Disable request/header/body capture and exception payload collection in ingress/APM. Never put subscription URLs in query strings or access-log labels.
6. Egress: permit provider TCP 443 and DNS only through controlled resolvers, plus explicit Supabase auth/database destinations. Deny nonpublic IPv4/IPv6 provider egress at the host/firewall as defense in depth, exempting only the separately configured database/DNS endpoints where necessary. Do not enable a proxy that bypasses pinned lookup; do not add an address-policy bypass. Verify the host does not transparently rewrite public destinations to private services. Maintain current CA certificates. The application connection boundary remains mandatory even with firewall rules.
7. Run the hosted disposable-account smoke checklist in the acceptance document, including direct PostgREST RLS/secret denial and deployment log redaction. Only then set the app's **public** `EXPO_PUBLIC_LIVE_ICS_URL=https://<approved-service-origin>` and produce the normal platform build. Existing Supabase public configuration stays unchanged. Configuration absent/invalid leaves local calendars available with an honest unavailable message.

### Disable and rollback

Disable new service traffic at ingress or set `LIVE_ICS_ENABLED=false` and restart; the service fails closed. Remove the app endpoint in a subsequent build if needed. Cached events remain usable, marked stale on failure. Roll back the container image to the previous reviewed compatible version; leave the additive tables intact. Do not drop tables, revoke keys needed by backups, restore older cloud snapshots, or overwrite user data as a routine rollback. If removal is later required, export a private database backup and get explicit authorization for the destructive migration. Existing task/project sync does not depend on this service.

## Focused review scope

Review connection-time SSRF enforcement and test seams; key separation/AAD and rotation; verified ownership and RLS grants; durable limits/leases/generation fencing; parser completeness/resource bounds; account cache cancellation; initial-result/idempotency behavior; modal accessibility and stale/offline status. Do not repeat the general project-plan review or infer native acceptance from JavaScript exports. Existing decoder, braces and node-forge follow-ups remain open under `DEPENDENCY_ADVISORY_FOLLOWUP.md`; the backend's independent audit does not resolve those application findings.
