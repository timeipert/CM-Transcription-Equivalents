# CM-TranskriptionSeq (Paleographic Analysis Tool)

CM-TranskriptionSeq is a web-based platform designed for the paleographic analysis of medieval manuscript transcriptions. It allows researchers to visualize, categorize, and annotate "Token" evidence directly from digital scans.

## 🚀 Features

- **Paleographic Type Analysis**: Visualize abstract transcription patterns as dynamic SVGs.
- **Interactive Annotation**: Zoom, pan, and draw bounding boxes on manuscript scans to identify tokens.
- **Gallery Mode**: View all tokens of a specific type collected across different manuscripts.
- **Evidence PDF Export**: Generate professional reports including high-quality cropped snippets of your annotations, labeled with manuscript signatures and folios.
- **High Performance**: Optimized to handle large datasets (40MB+) smoothly using Vue 3 shallow reactivity and pre-computed indexing.

## 🛠️ Project Structure

- `/ui`: The Vue.js (Vite) frontend application.
  - `/src/composables`: Core logic for data handling, PDF generation, and image manifest resolution.
  - `/src/stores`: Pinia stores for user-defined tables and annotations.
  - `/src/components`: UI components for annotation and display.
- `/scripts`: Python utilities for processing raw XML/Excel data into the `data.json` format used by the UI.
- `/public`: Static assets including `data.json`, `image_manifest.json`, and manuscript `scans/`.

## ⚙️ Setup

### Prerequisites
- Node.js (v16+)
- Python 3.9+ (for data processing)

### Installation
1. Navigate to the `ui` directory:
   ```bash
   cd ui
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

### Running Tests
To verify the core paleographic processing logic:
```bash
python3 tests/test_logic.py
```

## 🗺️ Data Workflow

This tool operates on a "Schema-First" principle:
1. **Extraction**: Python scripts in `/scripts` process transcription data into a standardized JSON format.
2. **Indexing**: The UI builds a "Standard Signature" index based on physical folders in `/public/scans`.
3. **Annotation**: User selections are saved to LocalStorage (via Pinia) and mapped to the physical signatures, allowing data to be shared across any transcription variant.

## 🚀 Deployment (GitHub Pages)

This project is configured to deploy from the `docs/` folder:
1.  In your GitHub Repository, go to **Settings > Pages**.
2.  Set **Source** to "Deploy from a branch".
3.  Set **Branch** to `main` (or your default branch) and the folder to `/docs`.
4.  Click **Save**.
5.  To update the site, run `npm run build` in the `ui` folder and commit the changes in `docs/`.
6.  The `.nojekyll` file in `docs/` ensures that GitHub Pages correctly serves the built assets.

