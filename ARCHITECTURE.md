# Architecture

How the app in `ui/` is put together, and how to change it without breaking
people's work. For what the app does, see the README.

## The one rule that matters

**The user's work is annotations, tables and settings kept in the browser and in
a bound workspace folder. Everything else can be rebuilt.** So the code that
loads, saves, migrates and merges that data (`src/services/persistence/`,
`src/stores/`, `src/utils/workspaceSharing.js`) is held to a higher standard than
the rest: it is pure where it can be, it validates what it reads, it never
overwrites what it cannot read, and it is tested.

## Layers

```
views/  components/                 what the user sees (Vue SFCs)
composables/                        state and behaviour shared by screens
stores/                             Pinia stores: the app's state
services/                           logic that is not tied to Vue
  persistence/                      saving, loading, migrating the workspace
  iiif/                             IIIF URLs, manifest parsing and fetching
  ommr/                             reading an OMMR4all export folder
  pipeline/ sync/ metadata/         the monodi.app bridge and data adapters
utils/                              small pure helpers
```

Dependencies point downwards. A `services/` module imports no component, and where
it can avoid it, no Vue either — `workspaceSchema.js`, `manifestParser.js` and
`folderImport.js` are plain functions on plain data, which is why they are easy to
test.

## Data and persistence

### Stores and the persistence contract

Seven stores hold the user's data. Each implements the same three functions:

| function | meaning |
|---|---|
| `serialize()` | its state as plain JSON data |
| `hydrate(data)` | replace its state from such data; tolerate older shapes and wrong types |
| `reset()` | back to a fresh workspace |

They are registered once in `services/persistence/storeRegistry.js`, which is the
only place that knows where each lives (browser-storage key, workspace file).
`initPersistence()` (called from `main.js`) loads every store from browser
storage, then watches **what the store serializes** — not its whole state, so
transient fields such as the snippets' `loaded` flag or the IIIF manifest cache
never count as an edit.

### One change signal

A change in a persisted store bumps a counter in `changeTracker.js`
(`revisionOf(storeId)`). The browser-storage mirror, the workspace-folder autosave
and the backup reminder all watch those counters, so the data is walked once per
store, not once per consumer. Code that loads state (from a file, an import)
runs inside `untracked(() => …)` so loading is not mistaken for editing.

### The workspace folder

`services/persistence/workspaceStorage.js` owns the bound folder:

* `workspace.json` — settings, annotations, tables, pattern library, OMMR settings
* `direct-snippets.json` — the direct snippet collections (they carry images, so
  they are written only when they change)

It never destroys what is there. A file that exists but cannot be read (corrupt, or
written by a newer app) is left untouched and saving is switched off with a
message. A file that was changed elsewhere is copied to
`workspace.backup-external.json` before it is replaced; one in an older format is
copied to `workspace.pre-v<N>.json` before it is upgraded; work displaced by
choosing a folder is saved as `workspace.replaced-<time>.json`.

All environment (browser APIs, stores) is injected, so the whole thing is tested
against an in-memory folder (`src/test/fakes.js`).

### The file format and its versions

`services/persistence/workspaceSchema.js` owns the format: `SCHEMA_VERSION`,
`migrate()` (every older version, and the pre-schema `{ version, content }`
envelope), `sanitizeData()` (drops what cannot be valid instead of failing the
whole file), and the functions that turn store state into a payload and back.
Backups, per-manuscript exports, configuration files and the workspace file all go
through it.

#### Changing the data model

1. **Add a setting**: one line in `PERSISTED_SETTINGS` (`stores/settings.js`). It
   is then saved, loaded, exported and imported. There is nothing else to edit.
2. **Add a persisted store**: implement `serialize/hydrate/reset`, add it to
   `PERSISTED_STORES` in `storeRegistry.js` and to `collectStores()`, and to
   `buildSettingsData`/`applySettingsData` or `buildCoreData`/`applyCoreData` in
   `workspaceSchema.js`. Add it to the round-trip tests.
3. **Change a stored shape**: bump `SCHEMA_VERSION`, add a function to `STEPS` in
   `workspaceSchema.js` that upgrades version N to N+1 *without mutating its
   input*, add a fixture test in `workspaceSchema.test.js`, and add a line to the
   version history at the top of that file. Browser-storage keys that change shape
   get a new key (see `annotations_v3`) and a `legacy` reader in the registry; the
   old key is left in place as a snapshot.

### Keys, ids

Annotation data is keyed by strings — `"Source_Folio"` (regions, manual lines).
A source's name can contain an underscore (`WiSch 4_5`), so keys are only ever
built and taken apart with `utils/keys.js`, which splits from the right. Never
`key.split('_')` or `key.startsWith(source + '_')`. New record ids come from
`utils/id.js` (`newId('r')`), never `Date.now()`.

### The annotation model

```
regions      { "Source_Folio": [ { id, name, points, unassigned? } ] }
regionItems  { [regionId]: [ { id, pattern, points, variant?, … } ] }
manualLines  { "Source_Folio": [ lineNumber, … ] }
```

A snippet always belongs to a line region. Whole-page snippets from older builds
are folded into regions on load (`migrations/legacyAnnotations.js`); those that fit
no line sit in a per-page region flagged `unassigned`, which the public line
galleries ignore.

## Screens that were split

`SettingsView` and `OmmrExplorerView` were each one very large component. Both are
now a thin shell over section/screen components in `views/settings/` and
`views/ommr/`.

The OMMR explorer's screens share one state object created by
`composables/ommr/useOmmrExplorer.js` and provided to them
(`ommrContext.js`); each screen takes what it needs from it. The logic that was
buried in the component is pure and tested: `utils/ommrFolioRule.js` (folder name →
folio label), `utils/ommrOptimizers.js` (choosing examples), `utils/ommrBake.js`
(deskew correction), `utils/ommrProjectMatch.js`, `services/ommr/folderImport.js`.

When you restyle one of these, keep a screen's CSS in its component; the shared
look is in `views/settings/settingsShared.css` and `views/ommr/ommrShared.css`,
whose rules are prefixed (`.settings-card`, `.ommr-ui`) so they cannot leak into
the components a screen merely hosts.

## Publishing

The site is built from source by GitHub Actions (`.github/workflows/pages.yml`); `docs/` is gitignored build output. Anything the site ships must be in `ui/public/` — `verify-build.mjs` fails the build otherwise. The workflow publishes the previous version at the site root (from a pinned commit) and the current one under `/next/`. See "Publishing" in the README.

### Two versions on one origin

Browser storage (localStorage, IndexedDB) belongs to an origin, and both versions live on `neume.monodi.app`. Left alone they would read and overwrite each other's data, which have different shapes. So the build for `/next/` sets `VITE_STORAGE_NS=next:` (`utils/storageNamespace.js`) and prefixes what it owns: the store keys and the reminder state in localStorage, the folder handle and sync record, and the direct-snippet database. On its first visit it starts from a copy of what the unprefixed version stored (the `legacy` readers in `storeRegistry.js`, and `loadCollections()` for the snippets) and the two are independent from then on; edits in one never reach the other. Shared on purpose: the GitHub connection (`monodi_github_config`, so it is entered once) and the image/manifest caches. Not shared: the bound workspace folder, which has to be chosen again in the new version (choose a different folder: the old version would overwrite the new one's file with its own format).

Any new key a build writes to browser storage must go through the prefix.

## Loading

Routes are lazy: a public visitor downloads the public views, not the editor. The
PDF and ZIP libraries load only when their button is used. A tab left open across
a deployment reloads once if a route's chunk has disappeared.

## Checks

```bash
cd ui
npm test            # vitest: pure logic, stores, persistence, the folder service
npm run lint        # eslint (+ template checks for undefined properties/components)
npm run typecheck   # tsc over the core modules (jsconfig.json); add files to `include` as they are typed
npm run build       # production build; fails if anything from public/ is missing in the output
```

CI runs all of them. Formatting (`npm run format`) is Prettier; it is not enforced,
because the code base was not written to it.

## Known gaps

* `discriminateSigns` can be switched from three places (Settings, the Pattern
  Library, the Overview). Elsewhere in the app a function has one entry point.
* Two tabs open on the same workspace folder are protected from silent overwrites
  (the older version is kept as a backup file) but not merged.
