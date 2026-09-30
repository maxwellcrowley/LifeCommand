# STORY-016 — Cloud Sync Foundation

Implemented September 29, 2026. Supabase provides optional email/password auth and one private cloud snapshot per user. Existing local persistence remains authoritative; cloud transfers require explicit preview and confirmation.

## Behavior and implementation

- Added `@supabase/supabase-js` with `npx expo install`, using existing AsyncStorage for persisted sessions. SDK 57 already supplies URL support. No new native modules or app configuration changes are required.
- `.env.example` documents the public URL and anon key. The client is created lazily; missing/partial/invalid config stays local-only and static web export does not create an auth client. Native token refresh follows foreground/background state; this only refreshes authentication, not app data.
- Settings → Cloud Sync shows configuration, signed-out/signed-in state, operation progress, the last cloud update, and retryable errors. Signup supports the email-confirmation-pending state. Sign-in/out never replaces local data. Sign-out only ends this client's session.
- `src/cloud/sync.ts` injects cloud I/O, revision storage, and existing local export/import operations for focused tests. Supabase-specific calls live in `src/cloud/client.ts`, outside components. Provider changes only stabilize the existing replacement/import callbacks.
- Upload serializes the same validated export envelope used by file transfer. The preview describes counts/settings and whether it replaces a newer cloud revision. Every upload is confirmed; an unknown/newer revision requires an explicit overwrite action. Server compare-and-swap also rejects concurrent writes after preview, including simultaneous first uploads.
- Download validates ownership, metadata, envelope/version, size, and app data before preview. Confirmation revalidates and checks the cloud revision/content again, then uses the existing import provider path. It writes a local recovery copy first, refuses replacement if backup fails, refreshes app data, and resets drafts. Recovery copies are labeled **Before import** in Data Management. Existing file import/export/recovery remains available.
- Cloud revision metadata is stored separately per project URL/account. Merely reading cloud status does not acknowledge a revision. Metadata-write failure after a successful transfer reports completion with a warning rather than incorrectly reporting a failed transfer.
- SQL defines the snapshot table, own-user RLS, grants, and an authenticated write RPC with an explicit UID check, fixed search path, atomic expected-revision check, version/size validation, and server timestamps. Direct client DML is revoked to prevent bypassing revision checks.

The local data/export contract remains version 3, so `docs/architecture/DATA_MODEL.md` is unchanged. Existing root `app/` routes are retained. No merge sync, realtime subscriptions, calendar-provider sync, or household sharing is included.

## Changed files

- `.env.example`
- `package.json`
- `package-lock.json`
- `app/(tabs)/settings.tsx`
- `src/data/useAppData.tsx`
- `src/cloud/config.ts`
- `src/cloud/client.ts`
- `src/cloud/sync.ts`
- `src/components/CloudSyncCard.tsx`
- `tests/cloud.test.ts`
- `tests/inspect-cloud.cjs`
- `docs/cloud/SUPABASE_SCHEMA.md`
- `docs/cloud/supabase_schema.sql`
- `docs/stories/STORY-016_CLOUD_SYNC_FOUNDATION.md`

`git status -sb` was clean (`## master`) before editing. No staging or commits were performed.

## Verification

| Exact command | Result |
| --- | --- |
| `npm run typecheck` | PASS, exit 0. |
| `npm run lint` | PASS, exit 0; no errors or warnings. |
| `npm test` | PASS, exit 0; 185 tests, 0 failures (11 new cloud tests). |
| `npx expo install --check` | PASS, exit 0; dependencies are up to date. |
| `npx expo export --platform web` | PASS, exit 0; 20 static routes exported to `dist`. |
| `node tests/inspect-cloud.cjs` | PASS, exit 0; missing configuration, Cloud Sync card, Today/Projects navigation, no runtime exceptions. |
| `node tests/inspect-cloud.cjs --configured` | PASS, exit 0; real Supabase JS client with mocked HTTP, signup confirmation, auth error/retry, sign-in, persisted session after reload, timestamp, stale-upload warning/cancel/concurrent rejection, invalid download rejection, responsive preview, backup failure/retry/order, recovery contents, live refresh/draft reset, confirmed upload and sign-out. |
| `node tests/inspect-transfer.cjs` | PASS, exit 0; existing export/import/recovery and responsive confirmation flows. |
| `node tests/inspect-today-projects.cjs` | PASS, exit 0; Today timeline/tasks, project task actions, mobile bounds, persistence/retry, empty state, no runtime exceptions. |
| `node .test-build/inspect-projects.cjs` | PASS, exit 0; existing project creation/lifecycle/linking/progress, stale edits, reload, mobile bounds. This pre-existing supplemental harness is ignored; tracked Today/Projects coverage remains reproducible. |
| `node tests/inspect-cross-tab.cjs` | PASS, exit 0; import/restore/reset and ordinary-write stale-editor protection across tabs. |
| `node tests/inspect-notifications.cjs` | PASS, exit 0; Settings web notification behavior, disabled controls, no permission prompts, mobile bounds and retained Today behavior. |
| `git diff --check` | PASS, exit 0. |

The first test/lint pass found a TypeScript assertion-narrowing issue and React effect/ref lint issues; those were corrected before the passing runs. Initial sandbox dependency/browser attempts could not access npm/Chrome DevTools; approved executions passed. Temporary stalled sandbox harness processes were stopped. The configured export needed `--clear` to avoid reusing a Metro bundle with missing environment values.

To reproduce the configured browser fixture in PowerShell (test-only credentials, no live backend):

```powershell
$env:EXPO_PUBLIC_SUPABASE_URL='https://cloud-test.supabase.co'
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY='test-anon-key'
npx expo export --platform web --clear --output-dir .test-build/cloud-dist
node tests/inspect-cloud.cjs --configured
Remove-Item Env:EXPO_PUBLIC_SUPABASE_URL
Remove-Item Env:EXPO_PUBLIC_SUPABASE_ANON_KEY
```

The additional configured web export passed with 20 routes. It lives under ignored `.test-build`; the normal `dist` export remains local-only. Browser previews were checked at 320×568, 390×844, and 844×390.

## Max's setup and follow-ups

Create a Supabase project, copy its URL and public anon key into `.env.local`, run [supabase_schema.sql](../cloud/supabase_schema.sql), configure the Auth Site URL for email confirmation, and restart Expo with `npx expo start --clear`. Full instructions, security model, and live-project checks are in [SUPABASE_SCHEMA.md](../cloud/SUPABASE_SCHEMA.md).

A live Supabase project was not supplied, so the SQL/RLS/RPC have not been executed against a hosted database. Real email delivery, two-account database isolation, actual concurrent RPC writes, and physical iOS/Android session/restore behavior remain deployment/device QA. Browser tests mock HTTP, and unit tests model the compare-and-swap boundary; neither substitutes for live database policy testing.

Automatic sync requires a separate design for record-level revisions/tombstones, offline queues, conflict resolution, retries, and ownership on account changes. Family sharing requires household membership/invitations/roles, membership-based RLS, a personal/shared data split, and migration rules. Current family events are private data in a user's snapshot. Neither follow-up should weaken the current isolation or turn destructive snapshot replacement into an automatic loop.
