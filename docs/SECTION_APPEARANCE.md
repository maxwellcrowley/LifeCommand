# Section icons and coordinated headers

## Controls and rendering

Settings → Personal sections → Create section or Edit opens the same editor.
The Icon field offers a labeled, searchable, wrapping grid of 30 icons plus
No icon. Selection has a border, visible Selected label and checked radio state.
Search matches labels and category keywords (e.g. dog → Pets). The live preview
shows the current name, icon and color. Both the existing swatches and a custom
six-digit hex color are supported. Saving retains the existing stale-edit guard,
and a failed save retains the draft for retry.

The shared `SectionHeader` is used by Today, Calendar task groups, Review,
project task lists, project cards, Settings and the backlog planner. It only
renders presentation; callers still own their counts, selection, expansion and
actions. Collapse storage keys, section IDs, grouping and ordering are unchanged.
Project status headings and calendar source identities are separate concepts.

Icons use the already-installed Expo Symbols family: SF Symbols on iOS and
Material Symbols on Android/web. No dependency or startup font gate was added.
Implementation reference: [Expo SDK 57 Symbols](https://docs.expo.dev/versions/v57.0.0/sdk/symbols/).

## Available stable identifiers

| ID | Label | ID | Label |
| --- | --- | --- | --- |
| `default` | General | `home` | Home |
| `work` | Work | `family` | Family |
| `health` | Health | `fitness` | Fitness |
| `learning` | Learning | `finance` | Finances |
| `shopping` | Shopping | `chores` | Chores |
| `pets` | Pets | `travel` | Travel |
| `hobbies` | Hobbies | `projects` | Projects |
| `tasks` | Tasks | `calendar` | Calendar |
| `garden` | Garden | `food` | Cooking |
| `books` | Reading | `music` | Music |
| `games` | Games | `car` | Car |
| `tools` | Repairs | `mail` | Mail |
| `ideas` | Ideas | `goals` | Goals |
| `personal` | Personal | `security` | Security |
| `computer` | Technology | `inbox` | Inbox |
| `none` | No icon | | |

## Persistence and compatibility

`Section.icon?: string` is account data, alongside name and color. It goes
through existing repository writes, account namespaces, cloud serialization,
portable exports/imports and recovery backups. It is not a device preference.
The account boundary remounts editors when the active account changes.

Absent fields stay absent and display General. The explicit `none` identifier
displays no icon. Identifiers must match `[a-z][a-z0-9-]{0,39}`. Unknown but
well-formed identifiers survive round trips and render General; this lets a
future catalog be read without losing a choice. No stored string is passed
directly to the native icon library. Invalid types/format reject during strict
import/save; legacy normalization drops only an invalid icon field through the
existing recovery path. Existing records, IDs, colors and linked data survive.

This is an optional additive schema-4 field: no schema bump, eager rewrite,
storage-key change or reseed. Schema 1–4 imports missing the field remain valid.
Older application binaries with strict validators may reject exports containing
this new field; use a current client for cross-device import/sync.

## Color and contrast

The exact saved color remains the identity rail. Headers mix that color into
the theme surface (12% in light, 18% in dark). Tint strength is reduced if
needed to retain at least 4.5:1 contrast for heading text, counts and chevrons.
The icon starts with the chosen color; only if needed it is mixed toward black
or white until it also reaches 4.5:1 against the header. Stored colors are never
changed. Brand terracotta and priority/status colors are not involved.

## Verification

- `npm test`: 314 passing tests. New tests cover catalog/default/none/unknown,
  search, edit/stale rejection, invalid identifiers, older imports, cloud
  serialization, repository reload, two-account isolation, export and recovery,
  and light/dark contrast for custom colors including near-white and near-black.
- `npm run typecheck`, `npm run lint`, `git diff --check`: all passed in the
  final run. The full suite also checks for runtime source import cycles.
- `$env:EXPO_NO_DOTENV = '1'; npx expo export --platform web --output-dir .test-build/section-icons-web`:
  completed, 22 static routes. Disabling dotenv keeps this synthetic build free
  of configured account/provider endpoints.
- `node tests/inspect-section-icons.cjs`: passed using an isolated Chrome
  profile and loopback origin with external HTTPS requests blocked. Checks
  create/edit/search/selected state/reload/No icon, mobile overflow, light/dark
  color rendering, selection surviving planner collapse and unchanged tasks.
  Chrome DevTools requires execution outside the workspace sandbox here;
  the sandboxed attempt timed out on `Page.enable`.

New screenshots (generated, ignored by Git):
`.test-build/section-icons-editor-light.png`, `section-icons-editor-dark.png`,
`section-icons-today-light.png`, `section-icons-today-dark.png`,
`section-icons-planner-light.png`, `section-icons-calendar-dark.png`,
`section-icons-review-dark.png`, `section-icons-projects-dark.png`.

Remaining manual device QA: confirm all symbols render on physical iOS/Android;
VoiceOver/TalkBack announces radio checked state and collapse state without
decorative glyphs; largest system text preserves grid labels and Save/Cancel;
exercise account switching during an open draft. Browser checks do not establish
physical-device behavior.

## Git isolation

Feature files: `src/domain/sectionAppearance.ts`, `src/domain/sections.ts`,
`src/domain/models.ts`, `src/domain/normalize.ts`,
`src/components/SectionHeader.tsx`, `src/components/SectionIconPicker.tsx`,
`src/components/PersonalizationSettings.tsx`, `src/components/TaskList.tsx`,
`src/components/TaskScheduling.tsx`, `src/app/(tabs)/projects.tsx`,
`tests/section-appearance.test.ts`, `tests/inspect-section-icons.cjs`,
`docs/architecture/DATA_MODEL.md` and this report.

The workspace has pre-existing usability/visual and Outlook changes. Several
files changed here already contain unrelated hunks. The supplied filesystem
policy makes `.git` read-only; no checkpoint can be created within that policy.
No permission or lock-file changes were attempted. In a writable Git session,
review and stage only the new feature hunks:

```powershell
git add -- 'src/domain/sectionAppearance.ts' 'src/components/SectionHeader.tsx' 'src/components/SectionIconPicker.tsx' 'tests/section-appearance.test.ts' 'tests/inspect-section-icons.cjs' 'docs/SECTION_APPEARANCE.md' 'docs/architecture/DATA_MODEL.md' 'src/domain/sections.ts'
git add -p -- 'src/domain/models.ts' 'src/domain/normalize.ts' 'src/components/PersonalizationSettings.tsx' 'src/components/TaskList.tsx' 'src/components/TaskScheduling.tsx' 'src/app/(tabs)/projects.tsx'
git diff --cached --check
git diff --cached
git commit -m "Add section icons and accessible color-coordinated headers"
```

For overlapping hunks use split/edit in `git add -p`; do not stage entire mixed
files. The existing shared UI/theme work may need its own reviewed checkpoint
first so this feature commit has a buildable parent. No commit or push is claimed.
