# CM-Transcription-Equivalents

A research tool for mapping notation patterns in chant transcriptions to their physical graphical realizations in medieval manuscripts. The application provides an interface to manage transcription equivalents, annotate manuscript scans using IIIF, and generate public documentation for notation systems.

## Core Functionalities

### 1. Pattern Analysis & Equivalents Management
* **Transcription Analysis**: Aggregates pattern frequencies from transcription datasets.
* **Equivalents Table**: A central workspace to assign stable reference identifiers (Ref IDs) and notes to graphical patterns. This allows for a standardized numbering system across different manuscript sources.
* **Global & Local IDs**: Supports global identifiers for patterns across the entire project and manuscript-specific overrides.

### 2. Manuscript Annotation (Polygon Editor)
* **IIIF Integration**: Direct access to high-resolution manuscript pages via IIIF manifests.
* **Line Region Definition**: Draw and name specific line regions (e.g., "Line 1", "Line 2") on the manuscript scans.
* **Transcription Linking**: Link graphical signs on the scan to specific occurrences in the transcription data.
* **Variant Support**: Handle and display variants (e.g., "10a", "10b") by extracting suffixes from linked transcriptions or manual classification.

### 3. Public Documentation ("Notation Documentation")
* **Manuscript Directory**: A sortable index of all annotated manuscripts.
* **Patterns & Equivalents Index**: A summary table listing all assigned Ref IDs and their physical occurrences (Folio/Line) in the manuscript.
* **Manuscript Line Gallery**: A visual gallery of manuscript lines with interactive HTML labels overlaid on the scans.
* **Bidirectional Navigation**: 
    * Clicking an occurrence in the table jumps to the corresponding line in the gallery and pulses the specific annotation.
    * Clicking a label in the gallery scrolls the page to the relevant row in the pattern table.
* **Detail Magnifier**: Click on any annotation snippet to open a high-resolution modal for close-up study.

## Technical Implementation
* **Frontend**: Built with Vue 3 (Composition API) and Vite.
* **State Management**: Uses Pinia stores for annotation data, IIIF manifests, and user settings. All stores that hold the user's work share one persistence contract (`serialize` / `hydrate` / `reset`); see [ARCHITECTURE.md](ARCHITECTURE.md).
* **Rendering**: Custom SVG/HTML hybrid renderer for high-quality labels and interactive polygons on manuscript images.
* **Data Handling**: Work is kept in the browser (localStorage; IndexedDB for image snippets) and, optionally, in a bound **workspace folder** that is autosaved. The app never overwrites a workspace file it cannot read, and keeps a copy of any file it is about to replace that was changed elsewhere (see below).
* **Scripts**: Includes Python utilities (`scripts/`) for pre-processing transcription data and calculating pattern statistics.

### Where your work is kept, and how it is protected
* **Browser storage** is the working copy. Browsers may clear it, so bind a workspace folder (Settings → Project Folder) or export a backup regularly; the status pill in the toolbar shows where your work stands.
* **Workspace folder** — `workspace.json` (settings, annotations, tables, pattern library) and `direct-snippets.json` (image snippets). Besides those, the app may leave:
  * `workspace.backup-external.json` — the version of `workspace.json` that was replaced after it had been changed outside the app (another tab, another computer),
  * `workspace.pre-v1.json` — your file as it was before the app upgraded it to a newer format,
  * `workspace.replaced-<time>.json` — what was in the app when you chose a folder that already held a workspace.
* **Backups and exports** (Settings → Share / Backup) are versioned JSON; files from older versions of the app import fine, and a file from a *newer* version is refused rather than guessed at.

## Installation & Setup

### Prerequisites
* **Node.js** (v18 or higher)
* **Python 3.10+** (for transcription analysis scripts)

### Frontend (User Interface)
1. Navigate to the `ui` directory:
   ```bash
   cd ui
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Run the checks (all of them run in CI):
   ```bash
   npm test            # unit tests
   npm run lint        # eslint
   npm run typecheck   # type-check the core modules
   ```
5. Build for production:
   ```bash
   npm run build
   ```
   *Note: The production build is written to `docs/` at the project root. It is gitignored: GitHub Actions builds and publishes it.*

### Analysis Scripts
To run the transcription analysis scripts, ensure you have the required Python libraries installed:
```bash
pip install monodikit pandas
```
Run the analyzer:
```bash
python scripts/analyze_transcriptions.py
```

### Static Public Site Export (HTML, Markdown & IIIF Cropping)
The static export runs **in the app** (Settings → Share / Backup → *Download static site*).
It produces a ZIP that mirrors the public viewer offline: a directory page plus one
`index.html` + `index.md` per published manuscript, and cropped IIIF image snippets saved as
files (usable as citation "quotes"). Because it reuses the app's own IIIF resolution and gallery
logic, the export always matches the live `/public` route. Snippets are fetched live from the IIIF
servers, so keep the tab connected while it runs.

## Project Structure
* `/ui`: The Vue 3 application (`src/stores`, `src/services`, `src/composables`, `src/views`, `src/components`, `src/utils`).
* `/docs`: Production build output (gitignored; published by `.github/workflows/pages.yml`).
* `/scripts`: Python utilities for transcription processing.
* `/user-manual`: The VitePress user manual (`npm run build:manual` copies it into `ui/public/manual`).
* `/glyphs`: Pattern rendering assets.
* `/export`: (Excluded) Raw data exports from CM.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit and how to change the data model safely.

## Publishing
https://neume.monodi.app is built and deployed by `.github/workflows/pages.yml` on every push to `master`: lint, type-check and tests run first, then the build, and nothing is published if one of them fails. The build output in `docs/` is not committed.

* Everything the site ships must live in `ui/public/` (scans, the manual, `index.json`, the `sources/` data, `CNAME`) or in the bundle. `npm run build` fails if something in `ui/public/` did not reach the output.
* The repository setting *Pages → Build and deployment → Source* must be **GitHub Actions**, with the custom domain `neume.monodi.app` (switching the source clears the domain; set it again).
* **Rolling back:** revert the commit on `master` and push. The last build of the previous app (before the persistence rework) is the commit tagged `legacy-site-2026-10-04`; its saved data stays readable by the current app (see ARCHITECTURE.md, "Moving from the previous version").
* To publish a change to the manual, run `npm run build:manual` at the repository root and commit `ui/public/manual` (it is checked in because the CI build does not run VitePress).
* The `Dockerfile` builds the app from source (multi-stage) and serves it with nginx.

## Current Project Status
This tool is designed for personal research and small-scale collaborative documentation. Data is stored locally in the browser. 

The tool was part-wise created with the help of Large Language Models. 
