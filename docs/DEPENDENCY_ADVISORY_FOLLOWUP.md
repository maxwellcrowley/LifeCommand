# Dependency advisory follow-up — 2026-10-18

Scope: SDK 57, Expo Router 57.0.28, React Native 0.86.3. No native build or live
account was used. Current npm audit has 30 affected package entries (11 moderate,
19 high, 0 critical) after shell-quote 1.10.0 -> 1.11.0. Inherited package severity
is not evidence of a separate exploit. The shell-quote change does not replace
the separately bundled DevTools parser.

## Shipped decoder: evidence and reachability

[GHSA-vcc3-ghjq-m6fr / CVE-2026-45822](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr)
affects the installed transitive path:
`expo-router@57.0.28 -> query-string@7.1.3 -> decode-uri-component@0.2.2`.
The decoder is present in the review's web, Android and iOS production source maps.
Its presence does not establish that application URLs invoke the vulnerable function.

Installed source trace (paths relative to node_modules/expo-router/build):

| Path | Decoder reachability |
| --- | --- |
| `react-navigation/core/getStateFromPath.js:494` | The fallback parses query text with query-string.parse, reaching the vulnerable decoder. |
| `fork/useLinking.native.js:59,114,119,150` | Default parser is React Navigation's fallback. Initial URL and subscribed URL events both call getStateFromPathRef. An enabled container without an override can therefore feed external URLs to the fallback. |
| `react-navigation/native/useLinkBuilder.js:112` | useBuildAction falls back to core.getStateFromPath when its linking context has no parser override; useLinkTo uses this helper. Caller-supplied href reaches the decoder in that configuration. |
| `global-state/useStore.js:47` and `ExpoRoot.js:135` | Normal Expo Router constructs getLinkingConfig and passes store.linking to NavigationContainer. |
| `getLinkingConfig.js:90`, `link/linking.js:53` | Explicit override selects Expo's fork/getStateFromPath for incoming paths. |
| `fork/getStateFromPath.js:525`, `fork/getStateFromPath-forks.js:370` | Expo's query helper uses URL.searchParams, not query-string.parse. |
| `fork/NavigationContainer.js:35,43` | Without linking, incoming-link handling is disabled; with linking, its override is passed into useLinking and LinkingContext. A missing store is not by itself proof of an enabled vulnerable fallback. |

LifeCommand uses Expo Router's Stack in src/app/_layout.tsx, with no custom
NavigationContainer, parser override or direct useLinkTo/useBuildAction found in
application source. Router-driven navigation uses the store's linking parser.
Static tracing therefore does not establish external-URL reachability of the
vulnerable fallback in this application. It does establish a fallback hazard if
the linking override is removed, replaced, or omitted by a future integration.

Fresh bounded Node diagnostics (`node tests/inspect-router-decoder.cjs`):

- Direct decoder, 1,000 repeated `%FF` sequences: exceeded three seconds; isolated
  child terminated.
- Installed React Navigation fallback, `/projects?probe=` plus the same input:
  exceeded three seconds; isolated child terminated.
- Installed Expo Router query helper with identical input: returned successfully.

The prior independent review also executed this malformed query through the actual
web export and found it responsive. These are library/parser and web results.
They do not execute Android/iOS URL delivery, Hermes, startup races or a physical
device's navigation context. Native exploitability remains unverified, not disproved.

## Compatible remediation search

Fresh npm registry queries (`npm view expo-router@57 version dependencies.query-string
--json` and `npm view query-string@7 version dependencies.decode-uri-component
--json`) found latest SDK-57 router 57.0.28 still declaring `^7.1.3`; latest
query-string 7.1.3 still declares `^0.2.2`. The advisory fixes the decoder in 0.5.0,
which is ESM and outside the parent's supported range. No compatible published
fix was confirmed. Audit's proposed Router 58 upgrade is outside this task's SDK
scope. The upstream [module-format mismatch report](https://github.com/expo/expo/issues/35173)
also demonstrates why forcing a newer query-string major is not a safe substitution.

No decoder override, local vendor fork, broad dependency upgrade or application
URL-filter change was made. Request an upstream SDK-57/CommonJS-compatible backport
with the fallback reproduction, or reassess a supported Expo patch when published.
Do not remove or weaken the explicit Expo parser override. Before broader
distribution, complete the native checks below or resolve this uncertainty through
a validated compatible remedy. A responsive web test is not native clearance.

## Precise Android test after the next preview APK

Use a disposable account and synthetic records; preserve existing installed data.
Run the normal URL first, then malformed input, both with the app foregrounded
and after force-stop. These commands are a handoff, not executed device operations:

```powershell
$appIdentity = (Get-Content app.json -Raw | ConvertFrom-Json).expo
$testScheme = @($appIdentity.scheme)[0]
$baselineUrl = "${testScheme}:///projects?probe=ok"
$malformedUrl = "${testScheme}:///projects?probe=" + ('%FF' * 1000)
adb shell am start -W -a android.intent.action.VIEW -d $baselineUrl -p $appIdentity.android.package
adb shell am start -W -a android.intent.action.VIEW -d $malformedUrl -p $appIdentity.android.package
adb shell am force-stop $appIdentity.android.package
adb shell am start -W -a android.intent.action.VIEW -d $malformedUrl -p $appIdentity.android.package
```

Compare cold/warm startup and interaction with the baseline; confirm the Projects
screen responds to taps and Back, with no ANR or sustained JS stall. Repeat the
query on a synthetic project's detail path, including while a modal is open, and
test a normal OAuth return/reminder tap afterward. Record APK build ID, Git HEAD,
device/OS, delivery mode and timings; do not include tokens in shared logs. Repeat
equivalent cold/warm link delivery on iOS. A reproducible freeze blocks broader
distribution and needs a parser/reachability fix, not an advisory suppression.

## Other remaining high findings

- [braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm):
  braces 3.0.3 via micromatch 4.0.8 and Metro file watching. An attacker must
  control nested patterns; inspected patterns derive from trusted build config.
  The review's bounded Node probe did not reproduce stack exhaustion. No patched
  release is listed; package was absent from production export maps. Keep build
  configuration trusted and Metro access restricted; track the upstream fix.
- [node-forge GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv):
  node-forge 1.4.0 via Expo CLI/code-signing-certificates. Malformed PKCS#1 v1.5
  verification with low-exponent keys is the relevant prerequisite. Located
  usage is tooling; default generated exponent is 65537, and this app has no
  configured update-code-signing certificate. Actual signing keys were not
  inspected. No patched release is listed; absent from production export maps.
  Do not rely on affected paths for untrusted signature/certificate verification
  without a validated mitigation. Native signing credentials remain unchanged.

These findings do not prove this APK is exploitable and do not prohibit controlled
device acceptance. They remain tracked risks; hosted Supabase internals and EAS
workers' separate tooling dependencies are outside this npm audit.
