# Warm visual refinement

## Scope and safety

This is a presentation-only refinement. It does not change application IDs,
storage keys, account namespaces, export formats, OAuth callbacks, backend
configuration, task semantics, calendar credentials, caches, or visibility
overrides. Existing density and appearance choices remain device preferences;
section and calendar colors remain user data and are never replaced by the
theme.

The supplied reference was used as direction for warmth, whitespace, hierarchy,
and restrained accent use. Its marketing decoration, sample content, logo, and
device frame are deliberately not copied into product screens.

## Semantic tokens

`src/theme/palettes.ts` is the source of truth for both appearances.

| Role | Light | Dark | Rule |
| --- | --- | --- | --- |
| Canvas | `#FAF6EF` | `#1E1816` | Page background only |
| Surface / elevated | `#FFFFFF` | `#29201D` / `#332824` | Cards, fields, dialogs |
| Primary / muted text | `#332B27` / `#70615A` | `#FFF7EF` / `#C9B8AE` | Do not use color alone for meaning |
| Border / divider | `#E8DCD3` / `#F0E6DE` | `#4A3A34` / `#3A2D29` | Quiet separation, not heavy rules |
| Brand terracotta | `#B94F35` | `#E07A5F` | Brand swatch; not automatically text |
| Accessible primary accent | `#8F3927` | `#E07A5F` | Primary controls, focus, selected outlines |
| Soft / selected | `#F3DDD1` / `#F8EAE2` | `#3A251F` / `#58352B` | Tinted headers and restrained emphasis |

Success, warning, danger, focus, disabled/pressed controls and shadows have
separate semantic tokens. Accent and danger are intentionally darker/brighter
companions where needed to retain at least 4.5:1 text/control contrast on the
canvas, white surface, and soft section surface. Section, source-calendar, and
priority identity are supplementary to labels, status text, and icons.

## Component rules

- Pages use the warm canvas, 16px rhythm, readable title hierarchy, and a
  generous safe-area bottom inset.
- Cards use a 20px radius, quiet border, and minimal elevation. Nested task
  rows use a smaller radius, divider, section-color rail, explicit priority
  label, and distinct controls for opening details versus completing/editing.
- Section headers use soft tint, stable collapse state, and live counts;
  project headers remain visibly subordinate. Existing task grouping and
  ordering remain domain-derived.
- Primary actions use accessible terracotta; outlined secondary actions retain
  a clear border and pressed state. Destructive actions stay visually distinct.
- Bottom navigation uses cross-platform `expo-symbols` rather than encoded
  text glyphs. Labels remain the accessible source of navigation meaning.

## Verification record

The following checks were run against the existing synthetic fixtures:

| Command | Result |
| --- | --- |
| `npm test` | Pass: 309 tests, including light/dark contrast, task grouping, scheduling, account-scoped preferences, and storage/recovery coverage |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `git diff --check` | Pass |
| `npx expo export --platform web --output-dir .test-build/visual-dist` | Pass: 45 static web files |
| `npx expo-doctor` | 20/21 checks passed; the pre-existing SDK 57 patch-version drift is listed below |

`tests/inspect-polish.cjs` was updated to expect the warm charcoal canvas and
now gives explicit failures for HTTP-listener and DevTools-WebSocket startup;
it also accepts isolated port overrides. It was launched against the fresh
synthetic export on both the default and fresh ports. In this environment its
180-second headless Chrome watchdog still expired before app navigation
produced new screenshots, so it is **not** counted as a browser pass. It did
not alter user storage. Existing baseline fixtures remain at `.test-build/polish-before-*.png` and
`.test-build/polish-after-*.png`; they predate this visual pass and must not be
presented as new before/after evidence.

Expo Doctor reports these dependency patch mismatches, which are outside this
presentation-only change: `expo` 57.0.26 (expected ~57.0.27),
`expo-auth-session` 57.0.13 (expected ~57.0.14), `expo-constants` 57.0.20
(expected ~57.0.21), `expo-linking` 57.0.11 (expected ~57.0.12),
`expo-notifications` 57.0.21 (expected ~57.0.22), and `expo-router` 57.0.24
(expected ~57.0.25). Browser and export checks use isolated synthetic local
storage only; they are not a substitute for physical-device testing.
