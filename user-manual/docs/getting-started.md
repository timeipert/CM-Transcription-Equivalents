# Getting Started

Welcome to the **CM Transcription Equivalents** user manual.

## What is this tool?
**CM Transcription Equivalents** is a specialized, lightweight research application designed specifically for **musicologists** working with medieval chant manuscripts and digital transcriptions. 

When analyzing chant repertoires, scholars often need to bridge the gap between abstract melodic data (e.g., modern transcriptions, MEI data, Volpiano) and the physical graphical reality of the medieval manuscript. This tool allows you to:
1. Identify and categorize reoccurring neume patterns in your transcription data.
2. Link those abstract patterns directly to specific ink strokes on high-resolution IIIF manuscript scans.
3. Establish a standard typology (Reference IDs) for graphical signs across different manuscript sources.
4. Generate interactive, public-facing documentation of your notation analysis.

## Opening it and choosing where your work is kept
Open <https://neume.monodi.app>. The first screen asks where to keep your work:

- **Choose Folder** (recommended, Chrome / Edge): pick a folder on your computer. Everything you do is saved into it automatically as `workspace.json`, so it survives clearing the browser and can be backed up like any file. See [Settings & Data Backup](./settings-and-data).
- **Continue without a folder**: your work stays in this browser only. Export backups regularly.

If you used an earlier version of the app in this browser, your work is still there: the app finds it and upgrades it, keeping copies of what it replaced.

## Prerequisites
- A modern web browser (Chrome, Firefox, Safari).
- Access to IIIF manifests for the manuscripts you wish to annotate (usually provided by library archives).
- Transcription data in a supported JSON format (exported from your primary transcription environment).

## Installation
The tool is primarily a web application. You can run it locally:
1. Clone the repository to your local machine.
2. Navigate to the `ui` directory in your terminal.
3. Run `npm install` to install dependencies.
4. Run `npm run dev` to start the local development server.
5. Open the provided `localhost` URL in your browser.

Next, read about the [Conventions & Terminology](./conventions) used in this application.
