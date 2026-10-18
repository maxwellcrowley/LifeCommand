# Live ICS acceptance record

Date: 2026-10-18. Base: `223a5124eb9b036f172060c744560eda566d2c1a`; branch `feature/live-ics`, isolated worktree `.test-build/live-ics`. This record covers the implementation commits on that branch. **Hosted/live subscriptions are not yet operational.** No production migration, hosted service deployment, native build, store submission or backend security-policy relaxation was performed.

The owner's master checkout and Android acceptance worktree were preserved. No Android acceptance changes were merged. Previously user-reported Android/project-plan/sync/reminder passes do not constitute ICS acceptance.

Validated implementation commits: `e2c1d0d179c0b9b71c5a5f68b4532bf81bd83016` (backend, migration, shared parser and backend tests), followed by `9bcc7b5e87d2332b4db62b8848b3bc2eb3db45c0` (application integration and browser regressions). The following documentation commit changes no runtime inputs. Focused review range starts at the base above.

## Executed evidence

| ID | Layer / setup | Expected and observed | Result |
|---|---|---|---|
| ICS-U01 | Full application Node/TypeScript suite | Existing task/project/cloud/provider tests plus ICS cache/API tests; 403 tests passed. ICS UTC/DST/recurrence/overrides/all-day identity tests executed as part of this suite. | Pass |
| ICS-B01 | Node 24 + Docker PostgreSQL 17, two synthetic auth IDs A/B | Apply additive migration to disposable database; owner A can read its ready rows, B cannot; anonymous read, authenticated DML and private-schema access denied. Actual database role/RLS enforcement, not mocked storage. | Pass |
| ICS-B02 | Local HTTP API + actual service/database, synthetic verified-identity adapter | Unauthenticated request rejected; missing and other-owner IDs have same outcome. Production identity adapter separately tested to call fixed Supabase user authority and reject failures. **No live Supabase token was used.** | Pass (local/simulated identity) |
| ICS-B03 | Real service/database + synthetic provider feed | Initial validation, idempotent create, revision-guarded rename/color/visibility, failed replacement preserving ciphertext/cache, valid empty feed, malformed feed and missing-cache 304 handling. Saved rows asserted. | Pass |
| ICS-B04 | Controlled promise gates + real PostgreSQL | Coalesced concurrent refresh, delete during refresh, expired lease takeover/replacement, stale worker rejection, cooldown, durable per-user limit, 16 global slots and 10-calendar quota. No duplicate/restored deleted rows. | Pass |
| ICS-T01 | Generated certificate + test-owned loopback TLS server and UDP DNS blackhole, Windows Node 24 | Real HTTPS pinning and original Host, untrusted/wrong-host certificate rejection, no credentials/cookies forwarded, production private/mixed-address rejection before connection, redirect/downgrade limits, compressed/decompressed bounds, DNS cancellation, stalled TLS handshake and read timeout destruction. Private services were not probed. | Pass |
| ICS-T02 | Dedicated parser process, UTC, external parent watchdog | Folded/escaped text, floating UTC, RDATE/EXDATE, empty/malformed/truncated feed and unsupported EXRULE; watchdog kills process independently of parser event loop. | Pass |
| ICS-S01 | Node AES-GCM | Fresh nonces; owner/connection/tag mismatch rejected; old key decryptable during key-ring rotation; no plaintext URL in stored ciphertext or returned metadata. | Pass |
| ICS-W01 | Disposable desktop Chrome, real local HTTP API/database/parser, intercepted synthetic auth/provider | Failed initial draft retained with no saved connection; successful retry; duplicate click yields one fetch; metadata edit; URL never returned/populated/persisted; replacement; show/hide; source-labelled Calendar event; canceled/confirmed disconnect. | Pass |
| ICS-W02 | Same browser profile with API deliberately unavailable | Reload Calendar shows cached events plus unavailable status; reconnect keeps data. | Pass (simulated offline network) |
| ICS-W03 | Chrome 1280×900, 390×844, 320×568; actual extra-large app text preference; light/dark | Dialog controls fit width and retain >=44 px targets, body scrolls, footer reachable. Nine Tab movements remain within modal; dismissal restores non-body focus. Screenshots inspected. Not Android font/keyboard/TalkBack evidence. | Pass (browser) |
| ICS-W04 | Actual app sign-out/sign-in A→B while controlled provider response remains pending | Old account disappears; released A response cannot show in B or write B's cache. Two synthetic identities; not independent physical devices or live Supabase. | Pass |
| ICS-W05 | Actual Start Fresh with offline API and disposable B data | Mounted local calendar cache clears; remote B connection remains for later reconciliation. Start Fresh is not a disconnect. | Pass |
| ICS-Q01 | TypeScript, ESLint, Git | Typecheck, lint and diff whitespace check. | Pass |
| ICS-Q02 | Expo SDK 57 tooling | `expo install --check`: up to date. Expo Doctor: 21/21 passed. Public configuration loaded privately, values withheld. | Pass |
| ICS-Q03 | Expo production export | Web, Android and iOS JavaScript exports succeed. This is not native compilation. Synthetic public configuration used, no real tokens. | Pass |
| ICS-Q04 | Docker deployment image | Container image builds from the allowlisted context; production-only backend dependencies. Parser smoke passes as non-root with read-only filesystem, 256 MiB limit, 32-pid limit and no network. Separate backend npm audit: 0 production advisories. Application dependencies/lockfile unchanged. | Pass |

Backend suite: **17 tests passed**, including the nested database cases. The service tests use PostgreSQL roles with an `auth.uid()` fixture and independent synthetic UUIDs; they do not assert Supabase's hosted gateway configuration. TLS tests have explicit test-only injected loopback resolution/policy, while production classification is tested separately before any connection. Browser tests call the actual service and parser with synthetic provider/authentication responses. These distinctions are intentional.

Tooling identity: Windows host; Node 24.16.0; Chrome 155.0.8059.40; Docker Engine 29.4.0; PostgreSQL 17 test container. Final local image manifest digest: `sha256:7635f7953d8d99d22a46d092145e8cabbea7daa0b334bd082a4739ef190a8fec`. No native device model/Android version is represented by the browser viewport cases.

Local artifacts (ignored, not committed): `.test-build/live-ics-browser/result.json`, screenshots `failed-draft-desktop.png`, `dialog-1280.png`, `dialog-390.png`, `dialog-320.png`, `dialog-dark-large.png`; `.test-build/live-ics-platforms` exports; `.test-build/live-ics-full-tests.log`. Backend audit output is ignored under `backend/live-ics/artifacts-audit.json`. Reproduction commands are in [the implementation runbook](LIVE_ICS_IMPLEMENTATION.md).

### Initial failures and corrections retained

- Initial typecheck found a multi-child `FormError` usage; corrected to one message string. Initial lint found render-time ref assignments; moved them into effects. A later cleanup-ref warning was resolved by capturing the generation in the effect.
- First browser attempts stopped at onboarding or used a nonexistent Calendar Connections button. The harness now follows Skip setup and Accounts and connections.
- The first synthetic public key had an invalid format and was rejected by the existing configuration safeguard. A valid-format synthetic publishable key was used; no safeguard was changed.
- Metro initially reused cloud modules compiled without synthetic configuration; a clean export fixed the fixture. One harness started before that export completed and failed; subsequent dependent runs wait for export completion.
- The final browser rerun was initially invoked from the repository root instead of the documented backend directory, so its relative export path failed and it timed out at Settings. Running from `backend/live-ics` passed against the final export. A final container smoke invocation initially supplied `start/end` instead of the parser's `from/through` window contract and was rejected; the corrected invocation passed. These invocation failures were not application fixes.
- Synthetic CORS preflight initially omitted PATCH and Supabase public request headers, so rename/login were blocked. The harness was corrected to model them. The real backend already allowed its API methods/headers.
- The harness initially waited for title-case LifeCommand on Calendar, whose brand is uppercase, and assumed a fresh guest onboarding screen after sign-out. It now waits for the route/account's actual observable state. Initial failures are not reclassified as successful native/live tests; retained failure screenshots/text remain beside final evidence where captured.
- Inspection found the reused parser could tolerate truncated envelopes and unsupported recurrence constructs. The implementation now rejects those snapshots, with regression coverage, rather than accepting partial/empty results.
- The new cache follows Start Fresh lifecycle and fences pending work by generation; the mounted offline-reset browser case verifies it clears without deleting the backend connection.
- Conditional-response review added rejection of redirected 304s and requires stored validators before accepting a 304 snapshot, preventing cache reuse without a corresponding conditional request.

## Required hosted smoke checks — blocked on target authorization/deployment

No hosted project changes are authorized by this implementation task. First follow the additive migration/container/secret/egress steps in `LIVE_ICS_IMPLEMENTATION.md` after target approval. Then use two **disposable** confirmed Supabase users, aliases A/B, and a synthetic HTTPS ICS endpoint you control. Never use the owner's private calendar for destructive/failure tests.

1. Provision the named secrets and verify only the intended schema grants. Use the least-privilege login; never use a service-role key in the app. Confirm ingress/APM does not retain Authorization or request bodies, and provider errors are fixed codes.
2. Set private operator environment names `LIVE_ICS_SMOKE_API`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LIVE_ICS_SMOKE_EMAIL_A`, `LIVE_ICS_SMOKE_PASSWORD_A`, `LIVE_ICS_SMOKE_EMAIL_B`, `LIVE_ICS_SMOKE_PASSWORD_B`, `LIVE_ICS_SMOKE_FEED`. From `backend/live-ics`, run `node scripts/hosted-smoke.mjs`. Do not echo values. It tests auth, initial feed, cross-owner API/REST reads, direct DML/secret denial, edit, cooldown and idempotent delete; cleanup touches only its generated connection ID.
3. Inspect secret-table grants directly as administrator; PostgREST's hidden-schema 404 alone is not proof of SQL privilege denial. Verify the runtime login cannot access `cloud_snapshots` or unrelated tables and is not superuser/BYPASSRLS. Run role tests in a staging copy if project-wide default grants differ.
4. With controlled public HTTPS fixture endpoints, exercise a permitted redirect, rejected nonpublic DNS result, certificate failure, gzip overflow, provider 401/429/5xx, timeout, ETag/Last-Modified 304 and recovery. Confirm last-good events remain and no provider URL appears in logs. Check actual production DNS/TLS/proxy/egress behavior; local tests do not establish the hosting network boundary.
5. Run two service instances against the same staging database; refresh one ID concurrently, replace/disconnect during controlled slow responses, restart a worker with an active lease, then retry after expiry. Confirm snapshots/generations converge and no stale publication occurs.
6. Exercise encryption rotation with a synthetic subscription, restart, and decrypt via refresh. Verify no old-version active rows remain before retiring a key; retain old keys for retained backups. Test backup restoration in a separate staging database, never over current user data.

## Required device/operator sequence — not run

Access to physical devices/accounts was unavailable; this pass did not submit a native build. Existing Android builds `a6930ff0-ab78-4e32-9887-1c8b29e9165e` and `62304fec-a24d-4829-a6aa-2a048956db62` predate this implementation and cannot establish its runtime behavior.

After hosted smoke passes and a build from the reviewed branch includes the approved service origin:

1. Record commit, build ID, APK hash, device model/Android version, keyboard, font/display scale, theme and account alias. Use a disposable profile/device; preserve everyday data and do not uninstall/clear the owner's app.
2. Connect a controlled feed with UTC, embedded DST timezone, all-day/multiday and recurring/moved/canceled events. Compare exact dates/times against the fixture and another calendar viewer; verify source labels, read-only behavior and task/project/Focus/reminder counts unchanged.
3. Repeat all management actions. Interrupt initial connect, replace and refresh by losing connectivity. Retain draft while the dialog remains open, retry without duplicates, and confirm stale/empty statuses differ. Check provider authentication failures and cooldown guidance.
4. Open Calendar, background/foreground it, and inspect server counters: automatic refresh must obey freshness/cooldown and stop when another tab is active. Navigate outside coverage and read the explicit warning. Airplane mode + restart must show the account's cached events.
5. On a second independently authenticated device signed into A, verify connections, name/color, visibility, updated occurrences and disconnect convergence on next sync. Sign out/switch to B during slow refresh; no A data may appear in B. Return to A and confirm its own cache. This is the missing live-account/multidevice evidence.
6. TalkBack: traverse source rows/Manage/color choices, read-only events, errors, progress and disconnect/replacement confirmations. Verify labels, selected/disabled/expanded states, reading order, modal focus entry/containment/return, and no focus behind another modal. Exercise Android Back and real soft keyboard while editing; canceled close must preserve the mounted draft. Test largest OS font/display settings, landscape, narrow device, both themes and touch targets. Browser screenshots do not establish these results.
7. Equivalent iOS follow-up: new iOS build, VoiceOver modal focus/announcements, Dynamic Type, keyboard/safe areas, background/foreground refresh, offline startup and account switching. Android results will not establish iOS acceptance.

For each operator case record preconditions, actions, expected/observed outcomes, PASS/FAIL/BLOCKED, non-sensitive evidence location and build/device identity. Redact private URLs even in password-style editor recordings; never record tokens or OAuth callback data.

## Decision boundaries and remaining follow-ups

The implementation and local verification are ready for **focused security/behavior/UI review**, not release approval. No demonstrated local test failure remains in the final candidate. Hosted deployment/authentication/network-boundary testing and native/device accessibility remain open; live availability must not be advertised before they pass. The backend's zero-advisory audit does not remediate the app's separately documented decoder, braces or node-forge findings. Follow `DEPENDENCY_ADVISORY_FOLLOWUP.md` without unsupported overrides or claiming native link safety. The unrelated Android acceptance branch retains its own review and device obligations.
