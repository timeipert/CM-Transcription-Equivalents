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

## How the Settings view is organised

Settings shows one topic at a time; the list on the left (at the top on a phone) switches between them. The topic is part of the address (`#/settings?section=import`), so other views link straight to it.

| Topic | What it holds |
|---|---|
| **Storage** | the project folder and the backup reminder |
| **Import** | loading files into the workspace |
| **Export** | backups, exports of a selection, the static public site |
| **Workspace contents** | the manuscripts that hold data, with *Clean up…* per manuscript and *Remove all* |
| **Shared sync** | the monodi.app repository (see below) |
| **Display & IDs**, **Signs & variants**, **Source metadata**, **Folio alignment** | the project settings described further down |

## Backups and moving work between computers

### Export

**Settings → Export** is the one place to save the workspace to a file. Three presets set the check boxes; changing any box makes it a *Custom* selection.

- **Everything** — a full backup: every manuscript with data, every custom manuscript, all settings. Only a full backup resets the backup reminder.
- **Manuscripts only** — all manuscript data, no settings.
- **Settings only** — no manuscript data.

Below the presets, every part can be chosen on its own:

- **Manuscripts** — tick single manuscripts (filter by siglum, *Select all*, *Published only*).
- **Kinds of data** — *Annotations* (line regions, snippets, manual line numbers), *Equivalents tables* (Ref IDs and notes), *IIIF links*. A file without a kind of data says so, and importing it with *Overwrite* replaces only the kinds it carries: a file with only tables never removes line regions.
- **Custom manuscripts** — tick single ones. Their images are stored inside the file.
- **Settings** — *Display defaults*, *Preferred IDs*, *Signs and variants*, *Source metadata*, *Folio alignments*, *Pattern library*, *OMMR import settings*. The backup label stays in the browser and is never exported.
- **File** — the label (part of the file name) and the format: **one JSON file**, or a **ZIP with one file per manuscript** (plus one per custom manuscript and a `settings.json`), handy for passing single manuscripts on.

### Import

**Settings → Import** reads every file the app has written — backups, exports, custom-manuscript files, configuration files, workspace-folder files (also the safety copies listed above), files from older versions of the app — and ZIPs of them.

1. **Drop any number of files** on the import area, or click it to choose them. A ZIP is opened and each `.json` file in it is listed on its own. Files that are not `.json` or `.zip` are listed as *Not used*. More files can be added to the list before importing.
2. **Check the list.** Nothing has changed yet. Each file shows its kind, label, date and contents; files that cannot be read show why. Untick a file to leave it out, or remove it with ×. Files are applied **from top to bottom**; older files are placed above newer ones.
3. **Choose per manuscript.** A manuscript that is new is imported (or set it to *Skip*). A manuscript that is already in the workspace, or that an earlier file in the list also holds, is a *conflict* (highlighted) with these choices:
   - **Skip (keep mine)** — the default when the workspace already holds it.
   - **Merge (add, keep mine)** — adds line regions, snippets and table rows from the file, updates entries with the same id, removes nothing. The default when only an earlier file in the list holds it.
   - **Overwrite mine** — replaces the workspace's data of that manuscript (only the kinds of data the file carries).
   - **Import as copy** — keeps both; the file's version gets the siglum "… (copy)", "… (copy 2)", ….
   *All conflicts* above the list sets every conflict at once. Custom manuscripts count as the same when they share the internal id or the siglum.
4. **Settings.** A file that carries settings has the box *Apply the settings in this file*. It is ticked for the newest such file only; settings that a file does not contain stay as they are.
5. Press **Import**. The message afterwards has **Undo import**, which puts the whole workspace back as it was before (until the page is left).

A file written by a *newer* version of the app is refused instead of being guessed at.

### Workspace contents

**Settings → Workspace contents** lists the manuscripts that hold data, with *Clean up…* to delete some or all of one manuscript's data. **Remove all…** wipes the annotations, line regions, equivalents tables and IIIF links of every manuscript (settings and custom manuscripts stay); it can be undone until the page is left.

### Backup reminder
When you have made a number of changes and have not exported for a while, a small reminder appears. Under **Settings → Storage → Backup Reminder** you can turn it off. With a workspace folder bound, the folder is your backup and the reminder matters less.

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
