# Settings & Data Backup

The **Settings** view provides essential tools for managing your local data, customizing the application's display, and defining defaults to speed up your workflow.

::: info 💡 Suggestion for Future Documentation
*[Consider inserting a screen recording here showing the process of exporting a JSON backup and subsequently importing it.]*
:::

## Data Storage & Backup (Crucial!)

**CM Transcription Equivalents** stores all your work (manuscripts, regions, polygons, and equivalent mappings) directly in your browser's local storage. This ensures the app is fast and doesn't require a constant server connection. 

However, **if you clear your browser cache, you will lose your work!** Therefore, frequent backups are mandatory.

### Exporting Your Data
1. Navigate to the **Settings** tab.
2. In the "Data Backup" section, enter a label for your backup (e.g., "st_gallen_project").
3. Click **Export JSON**. The tool will download a complete snapshot of your workspace to your computer.

### Importing Data
If you switch computers, accidentally clear your cache, or want to collaborate with a colleague:
1. Go to **Settings**.
2. Click **Import JSON** and select your previously exported file.
3. The tool will seamlessly merge the imported data with your current workspace.

### Clearing All Data
If you need a fresh start, use the **Remove All Data** button. **Warning:** This action is irreversible. Always export a JSON backup before performing a full reset.

## App Defaults

You can customize how the application displays transcription patterns across all views (Equivalents table, Editor, Public view).

- **Global Pattern View (Standard)**: Choose how abstract transcription patterns are rendered:
  - **Graphic (SVG)**: Renders the pattern using a standard, generalized notation font (if available).
  - **Arrows (↗/↘)**: Renders the melodic contour using directional arrows (useful for quick visual scanning).
  - **Text (u/d/e)**: Renders the raw text string indicating melodic movement (up, down, equal).

## Preferred Custom IDs (Auto-fill)

To drastically speed up the annotation process, you can define **Preferred Custom IDs**.

If your transcription data frequently uses a specific text string (e.g., `*dd`) to represent a specific neume shape that you always label as Ref ID `Type A`, you can configure the tool to automatically recognize this.

1. In the **Settings** view, locate the "Preferred Custom IDs" section.
2. Enter the exact transcription pattern string (e.g., `*dd`).
3. Enter your desired default Ref ID (e.g., `Type A`).
4. Click **Add Preference**.

Now, whenever you draw a polygon in the editor and link it to an occurrence that matches the `*dd` pattern, the tool will *automatically* fill in the Ref ID as `Type A`, saving you manual entry time. You can still override it if needed.
