# Supabase cloud foundation

Slice 16 adds optional email/password authentication and manual snapshot upload/restore. Local AsyncStorage data remains authoritative on native and web. Sign-in, token refresh, and viewing cloud status never import or upload app data. There is no background data sync, merge, realtime subscription, household sharing, or calendar-provider integration.

## Setup for Max

1. Create a project in the [Supabase dashboard](https://supabase.com/dashboard). Keep email/password authentication enabled.
2. Copy the project URL and the public **anon** key from the project's Connect/API settings. Never use the service role key, secret key, database password, or user password as an environment variable.
3. Copy `.env.example` to `.env.local` in the LifeCommand root and fill both values:

   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-project-anon-key
   ```

4. Open the project's SQL Editor and run all of [supabase_schema.sql](./supabase_schema.sql). The script is transactional and can be rerun without deleting snapshots. It is the initial schema, not a migration engine for differently shaped existing tables.
5. In Supabase Auth URL Configuration, set a reachable Site URL for email confirmation (for local browser testing, the URL shown by Expo). Leave email confirmation enabled. For this slice the user confirms in their browser, then returns to LifeCommand and signs in with email/password. No native callback, magic-link, OAuth, or password-reset UI is included.
6. Restart Expo: `npx expo start --clear`. Use Settings → Cloud Sync → Create account, confirm the email, then Sign in. Upload on the device with the intended data; sign in to the same account on the other device and preview/confirm Download.

For EAS builds/updates and hosted browser builds, provide the same public variables in the build environment and rebuild/re-export. Expo embeds `EXPO_PUBLIC_*` values into client bundles, so they are not secrets. `.env.local` is gitignored. Missing, partial, or invalid configuration leaves the card in **Not configured · Local-only mode** and creates no client. See [Expo environment variables](https://docs.expo.dev/guides/environment-variables/).

## Cloud contract

Supabase Auth owns `auth.users`; LifeCommand does not create a password table. `public.cloud_snapshots` holds one row per user:

| Column | Meaning |
| --- | --- |
| `user_id uuid primary key` | References `auth.users(id)`; deleting the account cascades to its snapshot. |
| `payload jsonb` | Complete `lifecommand-export` envelope: format, schemaVersion, exportedAt, data. |
| `schema_version integer` | Matches the payload's version; uploads currently require version 3. |
| `revision bigint` | Starts at 1; server increments each successful write. Restricted to JavaScript safe integers. |
| `updated_at timestamptz` | Server timestamp for the last successful upload. |

Snapshots include sections, tasks (including archived tasks), projects, personal/family events, app settings, and rollover history. Auth sessions, device notification settings, local recovery copies, and cloud revision metadata are excluded. The app data/export contract stays at version 3; `docs/architecture/DATA_MODEL.md` is unchanged.

## Security and revision control

RLS policies limit SELECT/INSERT/UPDATE to `auth.uid() = user_id`. Anonymous users have no access. Authenticated users have SELECT permission only; direct table writes/deletes are revoked so clients cannot bypass revision checks. Writes use `write_cloud_snapshot(p_user_id, p_payload, p_schema_version, p_expected_revision)`.

The function is `SECURITY DEFINER` with an empty search path and fully qualified relations. Because the function's owner bypasses RLS, it explicitly rejects missing/mismatched `auth.uid()` and uses that UID for every write. Only authenticated callers may execute it. Do not grant direct writes or expose a service role key in the app. The RPC validates the envelope, version, and a 10 MB JSON text limit; detailed record/reference validation is performed by the same app validator used for import/export. JSONB text formatting can make the server size check slightly more restrictive near the limit.

The first upload uses expected revision 0 and `INSERT ... ON CONFLICT DO NOTHING`; later uploads use `UPDATE ... WHERE revision = expected`. A missing match raises SQLSTATE `40001`. Concurrent writers cannot both replace the same revision. A failed/ambiguous network response must be reconciled by previewing again, not blindly repeating a write.

Known revisions are kept outside app data under `lifecommand:cloud:v1:<project URL>:<user ID>`. Only successful upload/restore acknowledges a revision. Status reads do not. Missing/older/invalid known revisions produce a prominent warning with an explicit **Overwrite newer cloud snapshot** action. Every upload also has an ordinary replacement confirmation. Signing out preserves local data and known revisions; each account/project has its own key. Signing into a different account can upload the device's current data only after explicit confirmation.

## Restore and recovery behavior

Downloads validate the cloud owner, metadata, envelope version, record fields, references, and size before showing counts/settings in a preview. Confirm rechecks the account and cloud revision/content. A changed cloud snapshot requires a new preview. Cancel and validation errors leave local data untouched.

Confirmed restore calls the existing provider `importData` path. It validates again and writes an exact local recovery copy **before** replacing active data. Backup failure aborts replacement; active-write failure retains the recovery copy. Recovery entries appear as **Before import** in Data Management because cloud restore shares this path. The provider refreshes data and increments its existing draft-reset generation, including Settings drafts. Existing browser cross-tab checks still require other tabs to reload. Local rollover resumes after replacement.

Uploads use the saved local export captured at preview time. Edits saved after that preview are not included. Downloads replace the local data present at confirmation, with a recovery copy of that data. They do not merge. If known-revision persistence fails after a successful transfer, the UI reports completion with a warning; subsequent uploads conservatively warn again.

## Verification against a real project

The repository has unit and browser tests with mocked HTTP; a live project and native devices are not provisioned by this slice. Before using personal data:

1. Use two disposable accounts. With each account's JWT, verify SELECT returns only its row, an RPC with the other UID fails, signed-out access fails, and direct INSERT/UPDATE/DELETE fails.
2. Issue two RPC calls with the same expected revision; exactly one succeeds. Test expected revision 0 from two clients too.
3. Upload from one device, sign in on another, preview/restore, and recover the previous data from Data Management. Test an offline request and a stale overwrite warning.
4. Verify email confirmation, app restart/session persistence, foreground token refresh, and sign-out on iOS and Android development builds. Auth uses existing AsyncStorage; it is not an encrypted credential vault.

## Future slices

- Automatic sync needs a durable operation queue, record-level revisions/tombstones, merge rules, conflict UI, retry/backoff, and account-switch ownership decisions. Do not turn this whole-snapshot replacement into an unattended loop.
- Household sharing needs households, explicit membership/invitation/role tables, membership-based RLS, ownership migration, and a separation of private/personal versus shared data. Local `familyEvents` currently means a collection inside a private user snapshot, not shared access. Never relax the current user predicate to enable sharing.
- Snapshot history/retention, account deletion UI, password reset, secure native credential storage, and live database policy tests can be added independently.

References: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo Supabase integration](https://docs.expo.dev/guides/using-supabase/), [Supabase React Native auth](https://supabase.com/docs/guides/auth/quickstarts/react-native), and [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Expo 57 already supplies URL support; no URL polyfill or additional native module was necessary.
