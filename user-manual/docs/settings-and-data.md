# Settings & Data Backup

The **Settings** view holds everything about *where your work is kept*, how to back it up and move it, and the project-wide options that shape the other views.

## Where your work is kept

Your annotations, equivalents tables, pattern library and settings are kept in two places:

1. **Browser storage** is the working copy. It is fast, but browsers may clear it (clearing site data, private windows, low disk space).
2. **A workspace folder** (Settings → **Project Folder**, Chrome / Edge) is the permanent copy. Once a folder is chosen, every change is saved into it automatically.

The status pill in the toolbar shows where things stand: *Saved*, *Saving…*, *No changes*, *Not saved* (browser storage is full) or *Not saving* (the folder's file cannot be used — nothing is written to it until you fix that).

### What is in the folder
| File | Contents |
|---|---|
| `workspace.json` | settings, annotations, equivalents, pattern library, OMMR settings |
| `direct-snippets.json` | the image snippets of [Custom Manuscripts](./custom-manuscripts) (kept separate because images are large) |

The app only ever writes these files when it can read them. A file that is damaged, or was written by a **newer** version of the app, is **left untouched** and saving is switched off with a message, so the app can never overwrite something it does not understand.

### Safety copies you may find
The app keeps a copy before it replaces anything. These files are never deleted by the app:

| File | Why it exists |
|---|---|
| `workspace.pre-v1.json` | your file exactly as it was before this version upgraded it to its newer format |
| `workspace.backup-external.json` | the previous `workspace.json`, kept when it had been changed outside this tab (another tab, another computer) before the app replaced it |
| `workspace.replaced-<time>.json` | what the app held in the browser when the folder's own workspace was loaded instead (choosing a folder that already had one, or meeting a folder for the first time). **Import** it to get that work back |

Do not open the same folder in two browser tabs or two computers at once; the second one will keep the other's version as `workspace.backup-external.json`, but the two are not merged.

## Backups and moving work between computers

Under **Share / Backup**:

- **Export Manuscripts** downloads all manuscripts that have data as one JSON file. Tick *Include Settings* to add your configuration, pattern library and OMMR settings.
- **Specific Manuscript(s)** exports only the ones you pick.
- **Export Config / Import Config** move only the configuration (display mode, preferred IDs, custom signs, alignments, …), without any annotations.
- **Import Backup / Manuscript File** reads any file the app has exported — also from older versions of the app. If a manuscript in the file already exists in your workspace you choose, per manuscript, to **overwrite** it, keep both (**copy**) or **skip** it. A file written by a *newer* version is refused instead of being guessed at.
- **Remove All Data** wipes the manuscript data from this workspace. Export a backup first; it cannot be undone.

### Backup reminder
When you have made a number of changes and have not exported for a while, a small reminder appears. Under **Backup Reminder** you can change when, or turn it off. With a workspace folder bound, the folder is your backup and the reminder matters less.

## App Defaults and project settings

- **App Defaults** — how patterns are drawn everywhere: *Graphic (SVG)*, *Arrows (↗/↘)* or *Text (u/d/e)*.
- **Preferred Custom IDs** — define a default Ref ID for a pattern (e.g. `*dd` → `Type A`). When you link a polygon to an occurrence of that pattern, the ID is filled in for you; you can still override it.
- **Source Metadata** — define your own attributes for manuscripts (century, region, …) and fill them in per manuscript. They become filters in the public views.
- **Custom Signs & Code Variants** — define special signs (for example a virga) and the pattern variants derived from them. The switch *discriminate signs* decides whether variants are counted separately or merged into their base pattern.
- **Manuscript Alignment** — tell the app how the folios of the transcription map onto the pages of the IIIF manifest, including jumps where the manifest skips images.

## Shared Sync (monodi.app)
The **Shared Sync** panel connects the app to the GitHub repository your project shares with monodi.app (an access token with read/write *Contents* permission on that repository; it is kept only in this browser and sent only to GitHub).

- **Pull** brings in source records, equivalents and annotations. It **adds and updates and never removes** what you have here.
- **Push** writes your equivalents, line regions and snippets back, changing only manuscripts whose data actually changed. It never removes anything in the repository and it never overwrites a newer commit.
- **Export / Import database file** exchanges the same data as one file when there is no repository.

Snippets that belong to no line (shown under "Unassigned" in the annotation view) are not pushed.
