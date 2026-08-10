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

### 3. Public Documentation (Notationsdokumentation)
* **Manuscript Directory**: A sortable index of all annotated manuscripts.
* **Patterns & Equivalents Index**: A summary table listing all assigned Ref IDs and their physical occurrences (Folio/Line) in the manuscript.
* **Manuscript Line Gallery**: A visual gallery of manuscript lines with interactive HTML labels overlaid on the scans.
* **Bidirectional Navigation**: 
    * Clicking an occurrence in the table jumps to the corresponding line in the gallery and pulses the specific annotation.
    * Clicking a label in the gallery scrolls the page to the relevant row in the pattern table.
* **Detail Magnifier**: Click on any annotation snippet to open a high-resolution modal for close-up study.

## Technical Implementation
* **Frontend**: Built with Vue 3 (Composition API) and Vite.
* **State Management**: Uses Pinia for managing annotation data, IIIF manifests, and user settings.
* **Rendering**: Custom SVG/HTML hybrid renderer for high-quality labels and interactive polygons on manuscript images.
* **Data Handling**: Currently utilizes browser `localStorage` for personal data persistence.
* **Scripts**: Includes Python utilities (`scripts/`) for pre-processing transcription data and calculating pattern statistics.

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
4. Build for production:
   ```bash
   npm run build
   ```
   *Note: The production build is output to the `docs/` directory at the project root for easy hosting on GitHub Pages.*

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
* `/ui`: The Vue 3 application.
* `/docs`: Production build for hosting (GitHub Pages).
* `/scripts`: Python utilities for transcription processing.
* `/glyphs`: Pattern rendering assets.
* `/export`: (Excluded) Raw data exports from CM.

## Current Project Status
This tool is designed for personal research and small-scale collaborative documentation. Data is stored locally in the browser. Future versions may include a backend integration for multi-user access and centralized data storage.
