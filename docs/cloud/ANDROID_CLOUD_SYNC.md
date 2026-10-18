# Android Cloud Sync configuration

## User-reported Android acceptance at integration (2026-10-18)

The user supplied build `a6930ff0-ab78-4e32-9887-1c8b29e9165e` and reported
successful Android installation and initial checks, then passing two-device sync,
project lifecycle and reminder testing. These reports advance the acceptance
record below; they were not independently observed, and this integration did not
verify the build's source commit or submit a new build. The approved feature is
`8ebca3bacd8f049bc508c9b801332152cf299290`.

Exhaustive offline-conflict, account-isolation/recovery, accessibility,
malformed-link and iOS acceptance remain open. Keep the bounded external-link
checks and dependency applicability limits in
[the decoder investigation](../DEPENDENCY_ADVISORY_FOLLOWUP.md).
See [the integration record](../PROJECT_PLANS_DELIVERY.md) for unchanged-code
verification and owner-checkout preservation. Earlier entries below describe
evidence available when written, not a claim of exhaustive current acceptance.

## Preview acceptance handoff (2026-10-18)

The follow-up corrections `02cb870` (initial-plan creation) and `39513c9`
(shell-quote 1.11.0) have passed local verification, but have not been natively
compiled. Include completed ordinary projects, cancel/confirm reopening, and
accepted completion during initial-plan editing/review in the device sequence.
The [decoder investigation](../DEPENDENCY_ADVISORY_FOLLOWUP.md) adds exact
cold/warm malformed-link commands and explains the unverified native reachability.
The fresh audit after remediation has 30 affected package entries: 19 high,
11 moderate, no critical. See that investigation for remaining applicability limits.

Fresh read-only EAS history confirms both `d8d0e2fa-5a01-4180-bb5e-8124c9fdee05`
and the later `bf4a7fff-9b86-4f0b-9bd6-96cdcf8002d8` are **FINISHED** with APK
artifacts. The earlier `require is not defined` config-loader issue is therefore
verified resolved remotely, followed by successful builds after supplying the
missing cloud variables. These builds were made from the earlier dirty owner
checkout (reported Git HEAD `1491d7e`); they do not validate the current feature
branch or its SDK patches. No new remote build was submitted in this task.

A fresh names-only GraphQL query confirms these names at project scope in EAS
**preview**; neither is supplied at account scope:

- `EXPO_PUBLIC_SUPABASE_URL`: present.
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: present.

No variable values were requested or printed by that query. Preview remains
`environment: preview`, internal distribution, `developmentClient: false`, Android
`buildType: apk`. Application IDs, EAS association, signing configuration, OAuth
callbacks and environment guards are unchanged. There is no currently reproduced
config-loader/missing-variable blocker. Compilation of the new feature HEAD and
device acceptance are still unverified.

After independent re-review, use the isolated feature checkout for the next build
(commands below are a handoff, not an executed build):

```powershell
Set-Location 'C:\Users\crowl\Documents\Expo Apps\LifeCommand\.test-build\project-plans-delivery'
npx eas-cli@latest build --platform android --profile preview --non-interactive --freeze-credentials
```

Open that new build's installation link on the Android test device and install
the APK. Alternatively, with Android platform-tools and USB debugging available,
substitute the ID returned by the build command and run:

```powershell
$previewBuildId = '<new-build-id>'
$previewBuild = npx eas-cli@latest build:view $previewBuildId --json | ConvertFrom-Json
Invoke-WebRequest -Uri $previewBuild.artifacts.buildUrl -OutFile '.test-build/LifeCommand-preview.apk'
adb install -r '.test-build/LifeCommand-preview.apk'
```

Keep existing signing credentials. If installation reports a signature mismatch,
resolve signing before continuing; do not uninstall or clear user data as a
workaround. Use disposable accounts and synthetic records for acceptance:

- Native/device: install/upgrade, cold start, keyboard, Back/dirty cancellation,
  completed-plan guidance, explicit reopen/add, and background/foreground sync.
- Accessibility: TalkBack/VoiceOver, largest system text, focus return, selected
  states, error announcement, and non-drag phase reorder.
- Reminders: permission states, quiet hours, complete/reopen/reschedule, one-time
  delivery and tap routing with the app foregrounded, backgrounded and terminated.
- Two devices: same-gate completion, divergent/offline edits, CAS conflict review,
  sync completion while Add phase is open, account isolation and export/recovery.

JavaScript exports and local config checks do not establish native compilation or
physical-device readiness. npm audit advisories remain separate dependency work.

## EAS Read app config investigation and verification (2026-10-11)

The remote logs show two distinct failures, not a repeated helper-import failure:

- Builds `6cd6a2b0-0264-4735-a619-fdc4594768ed` and
  `eb5a0db9-1ca1-48db-83c1-bb2077d15766` failed with `require is not defined`
  at `file:///home/expo/workingdir/build/app.config.js:2:36`. This was the old
  top-level `require('./scripts/check-cloud-config.cjs')` in a config that also
  exports a default function. The worker evaluated the transpiled file as ESM.
- Replacement `158bc091-dcd2-472f-b80a-075d9b84eac5` successfully imported the
  helper. Its actual exception was the missing Supabase configuration guard at
  `scripts/check-cloud-config.cjs:35:11`, called by `app.config.js:4:5`.
  Both requested variable names were absent from project and account preview
  environments. An exact-name GraphQL query requested names only, never values.

The complete runtime import chain is `app.config.ts` to
`scripts/check-cloud-config.cjs`. The `expo/config` import is type-only and is
erased. The helper has no unconditional imports: `require.main === module` is
valid in its CommonJS scope, and `require('@expo/env')` runs only when the helper
is invoked as a CLI without `--environment-only`. The config import does not
execute that branch. Static plugin references are expo-router, expo-secure-store,
expo-notifications and expo-splash-screen; the existing conditional Google iOS
plugin and reversed-client-ID scheme are preserved. Remote stacks prove the
replacement loader reached the helper's validation function, so inlining or
rewriting the helper is unnecessary. See
[Expo's configuration-loading documentation](https://docs.expo.dev/workflow/configuration/).

Runtime comparison:

- Local: Windows, Node 24.16.0, npm 11.13.0, Expo 57.0.26, Expo CLI 57.0.27,
  `@expo/config` 57.0.9, `@expo/require-utils` 57.0.5, TypeScript 6.0.3.
- Failed worker: Linux image `ubuntu-26.04-jdk-17-ndk-r27b-sdk-57`, Node 22.23.1,
  npm 10.9.8, with `npm ci --include=dev`. The uploaded lockfile pins the same
  project Expo/config-loader versions. The fallback stack uses the worker's
  separate `/usr/local/eas-build-worker/node_modules/@expo/config` and
  `@expo/require-utils`; their exact package versions are not reported in logs.
- EAS CLI 24.12.1 locally bundles `@expo/config` 55.0.10 and
  `@expo/require-utils` 55.0.6. These are not evidence of the worker's versions.
  The exact config command and config regression tests were also run under the
  worker's Node 22.23.1 locally.

Archive verification used `eas build:inspect --platform android --profile preview
--stage archive`. No `.easignore` exists, so `.gitignore` supplies exclusions.
The archive contains byte-identical `app.config.ts`, `app.json`,
`scripts/check-cloud-config.cjs`, `package.json`, `package-lock.json` and `eas.json`,
including the untracked helper. `.env.local`, node_modules and all `.test-build`
contents are excluded (the inspection copy contains an empty `.test-build`
directory). This follows [EAS upload inclusion rules](https://docs.expo.dev/build-reference/easignore/).
Neither stale uploads nor a cache problem explains the replacement failure.

The minimal fix was to set only `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` in this project's EAS preview environment, using
the existing validated `.env.local` public configuration with sensitive
visibility. Both names were subsequently confirmed present; values were withheld.
No additional app-config change, dependency, signing change, application/project
ID change, plugin change or OAuth callback change was needed.

Verification:

- All 345 tests pass. A new subprocess regression runs the exact
  `expo config --json --full --type public` command with synthetic EAS values and
  proves missing EAS variables cannot be concealed by local dotenv. All nine
  cloud configuration tests also pass under Node 22.23.1.
- `npx tsc --noEmit` and `npx expo lint` pass.
- The exact config command passes on both Node versions with real EAS preview
  variables, `EAS_BUILD=true` and `EXPO_NO_DOTENV=1`. Resolved config and full
  remote failure stacks are captured privately under ignored `.test-build`;
  resolved config and credentials are not printed. Identity fields match the
  pre-change baseline; existing regression coverage preserves plugins and OAuth.
- New [preview build d8d0e2fa-5a01-4180-bb5e-8124c9fdee05](https://expo.dev/accounts/crowleymh/projects/LifeCommand/builds/d8d0e2fa-5a01-4180-bb5e-8124c9fdee05)
  passed `READ_APP_CONFIG`, prebuild, the post-install cloud guard and credential
  preparation. It was submitted with `--freeze-credentials`, without clearing
  caches. Android compilation was still running when these phase results were
  recorded; APK installation and device behavior are not verified.

## Diagnosis (2026-10-11)

The affected app is an **installed preview APK**. The latest three EAS Android builds use the `preview` profile. Both public Supabase variables exist and are nonempty in the local `.env.local`; its URL passes validation and its key is a publishable key. No values were logged. Neither variable was present in EAS development, preview or production at either project or account scope when inspected.

`.env.local` is gitignored and there is no `.easignore` override. EAS therefore does not upload this file. Local Expo/Metro (including web exports, Expo Go and a development client connected to Metro) can inline local values; a remotely built preview APK needs values in EAS **preview**. Editing `.env.local` or restarting Expo cannot alter an installed APK's embedded bundle.

The client already uses Expo's supported static references:

```ts
process.env.EXPO_PUBLIC_SUPABASE_URL
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
```

Do not replace these with destructuring, computed access, or a runtime environment map. Configuration detection only establishes whether configuration was supplied; it does not verify network connectivity, Auth, database schema or RLS.

## Publisher setup for the affected preview APK

From the repository root, use the existing EAS project (`app.json` → `extra.eas.projectId`). Select the same Supabase project used by the intended account data. Changing the project URL changes account and revision namespaces; do not treat a different project's empty account as missing/deleted data.

1. Run `npm run check:cloud-config`. This loads Expo's production-mode dotenv precedence and checks the effective configuration without printing values. Shell variables take precedence over local files.
2. In EAS, configure these two **project-scoped preview** variables, using the already validated local values. These commands prompt for the value rather than putting it in command history:

   ```powershell
   npx eas-cli@latest env:set preview --name EXPO_PUBLIC_SUPABASE_URL --type string --visibility sensitive --scope project
   npx eas-cli@latest env:set preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --type string --visibility sensitive --scope project
   ```

   `sensitive` keeps values out of routine CLI output but still makes them available for build and update bundling. They are **public client configuration**, visible in the app bundle, not secrets. Use a Supabase `sb_publishable_...` key or legacy JWT with role `anon`. Never use `sb_secret_...`, `service_role`, a database password or a user token. Do not use EAS `secret` visibility for these public variables: update jobs cannot read secret values. Do not push all of `.env.local`; unrelated calendar settings may target different environments.

3. Verify the remote environment without falling back to local dotenv:

   ```powershell
   npx eas-cli@latest env:exec preview "node scripts/check-cloud-config.cjs --environment-only"
   ```

   This command requires Bash (Git Bash on Windows). If unavailable, the EAS build hook below performs the same mandatory check on the worker. Avoid `env:list --include-sensitive` and printing/exporting environment values into logs.

4. Build a replacement preview APK:

   ```powershell
   npx eas-cli@latest build --platform android --profile preview
   ```

   Each profile now explicitly selects its matching EAS environment. The `eas-build-post-install` hook refuses missing, partial, malformed or unsafe configuration before native bundling. `app.config.ts` also rejects invalid/unsafe supplied keys before local export/start or remote builds. Completely absent local configuration still allows local-only development. For mocked browser exports, use `sb_publishable_synthetic_test_only` with the harness's mock URL instead of the older arbitrary `test-anon-key` fixture.

5. Download the new APK and install it **over** the existing app with the same Android package (`com.crowleymh.LifeCommand`) and signing key. If using ADB:

   ```powershell
   adb install -r "C:\path\to\LifeCommand-preview.apk"
   ```

   Do not uninstall, clear app storage, reset data, or change package/signing identity to resolve an install error. Resolve a signature/version mismatch through the publisher's original signing credentials and an appropriate version code. Use the app's existing local export/recovery tools to retain an additional backup before installing. No cloud upload is required to make a backup.

The preview values and verification build were configured as recorded above. Installing the resulting APK remains a separate device step; this work does not upload app records.

## Other development and distribution workflows

| Workflow | Configuration source | Commands |
| --- | --- | --- |
| SDK 57 compatible Expo Go | Local `.env.local` via Metro | `npm run check:cloud-config`, then `npx expo start --go --clear`; open the project and fully reload. Native integrations absent from Expo Go still require a development build. |
| Existing development build connected to Metro | Local `.env.local` via Metro | `npm run check:cloud-config`, then `npx expo start --dev-client --clear`; open the matching development client and fully reload. An env-only JS change does not require a native rebuild in this workflow. |
| New EAS development build | EAS `development` when building; local Metro configuration when connected | Configure/verify the same two variables using the commands above with `development`, then `npx eas-cli@latest build --platform android --profile development`. |
| Installed production build | EAS `production` | Configure/verify the two variables with `production`, then `npx eas-cli@latest build --platform android --profile production`; distribute the resulting AAB through the existing Play app. |
| Local web | Local environment during Metro/export | `npx expo start --web --clear` or `npx expo export --platform web --clear`; redeploy a new export to change hosted configuration. |

Do not use `NODE_ENV` to choose an EAS environment. Export uses production mode independently of the selected EAS environment. Keep `EXPO_NO_CLIENT_ENV_VARS` unset; it disables the static inlining this client needs.

## EAS Update is not enabled in this app

There is no direct `expo-updates` dependency, `updates.url`, `runtimeVersion` or build channel. The generated Android manifest has `expo.modules.updates.ENABLED=false`. An OTA update cannot repair the currently installed preview APK. This fix uses a replacement build and does not introduce a new update delivery system.

If EAS Update is adopted later, first run `npx expo install expo-updates` and `npx eas-cli@latest update:configure`, review the generated update URL/runtime policy, set the matching build channels in `eas.json`, and create/install a new native binary. Only after that, publish compatible JS changes with an explicit matching environment, for example:

```powershell
npx eas-cli@latest env:exec preview "node scripts/check-cloud-config.cjs --environment-only"
npx eas-cli@latest update --platform android --channel preview --environment preview --message "Configure Android Cloud Sync"
```

Do not run that publish command for the current APK. `--environment preview` supplies EAS values to update bundling; the build profile's environment alone does not select the update environment. A channel must target the intended installed runtime and Supabase project.

## Verification and data safeguards

```powershell
npm run check:cloud-config
npm test
npm run typecheck
npm run lint
```

The tests include missing/partial/unsafe configuration, supported public key types, static environment references, user-facing messaging, and existing account isolation, automatic-sync, recovery and cloud revision protections. No configuration repair should upload guest records, merge accounts, replace snapshots, reset storage, acknowledge a revision, or change conflict behavior.

Verified on 2026-10-11: all 343 tests, typecheck and lint passed. `npx expo export --platform android --no-bytecode --output-dir .test-build/android-cloud-config --clear` succeeded. A value-withholding bundle inspection confirmed both effective public values were inlined, no corresponding `process.env` references remained, and the installed-app message was present. This export used local configuration; EAS configuration/build and device validation remain pending.

Device testing is still required. Install over the existing preview app, verify local guest records and recovery entries remain, and confirm the unavailable message is replaced by sign-in controls. Sign-in changes the active account view; guest records remain separately stored. Configuration/sign-in must not be used to migrate guest records automatically. Keep automatic sync disabled during initial verification. With disposable accounts/data and explicit transfer confirmation, verify session persistence, account switching, preview/cancel, backup-before-restore and stale-revision rejection. Record build ID and pass/fail without credentials. A successful configuration check or Android bundle export does **not** prove live Android sync works.

References: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [static environment references](https://docs.expo.dev/guides/environment-variables/), [EAS environments](https://docs.expo.dev/eas/environment-variables/usage/), [EAS CLI](https://docs.expo.dev/eas/cli/), [build hooks](https://docs.expo.dev/build-reference/npm-hooks/), [EAS Update setup](https://docs.expo.dev/eas-update/getting-started/), [Supabase API key types](https://supabase.com/docs/guides/getting-started/api-keys).
