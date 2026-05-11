# Manuscript Annotation (Polygon Editor)

The core visual feature of the tool is the **Polygon Editor**. This interface allows you to draw shapes directly onto high-resolution manuscript scans and link them to your transcription data.

## Setting up a Manuscript

Before you can annotate, you need to add a manuscript to your workspace.

1. Navigate to the **Manuscript Annotations** view.
2. Click **Add Manuscript**.
3. Provide a short, recognizable name (e.g., "St. Gallen 359") and a unique system identifier.
4. **Crucially**, provide the valid **IIIF Manifest URL** for the manuscript.
5. The tool will parse the manifest and load the image viewer.

::: info 💡 Suggestion for Future Documentation
*[Consider inserting a brief screen recording here demonstrating how to find a IIIF Manifest URL on a library site (like Gallica or e-codices) and pasting it into the application.]*
:::

## Drawing Line Regions

Annotations are organized by "Lines". Before drawing individual neumes, you must define the physical lines on the page.

1. Open a specific folio/page from the manuscript.
2. In the toolbar, ensure the **Line Region** tool is selected (often represented by a rectangle icon).
3. Click and drag a box around a complete line of music and text.
4. A prompt will appear asking you to name the region. Use a standard convention (e.g., "Line 1", "Line 2").
5. Repeat this for all lines on the page you wish to annotate.

## Annotating Specific Signs

Once lines are defined, you can annotate individual graphical shapes (neumes).

1. Select a Line Region you created.
2. Switch to the **Polygon** drawing tool in the toolbar.
3. Click to drop points around the perimeter of the specific neume you want to capture. Close the shape by clicking the first point again.

::: info 💡 Suggestion for Future Documentation
*[Consider inserting an animated GIF or short video here showing the precise click-by-click process of drawing a polygon around a complex neume shape.]*
:::

4. The **Transcription Linking** panel will open.
5. The panel displays occurrences from your transcription data that are mapped to this manuscript.
6. Select the exact occurrence that corresponds to the shape you just drew.

## Handling Variants

If the shape you drew is a slight variation of its standard Ref ID (e.g., it's a `10` but written with a distinct flourish), you can specify a variant.

- In the linking panel, there is a field for **Variant Suffix**.
- Enter your suffix (e.g., `a`, `b`, `*`).
- If your transcription data already contains variant suffixes (e.g., `10b`), the tool will attempt to extract and apply it automatically when you link the occurrence.
