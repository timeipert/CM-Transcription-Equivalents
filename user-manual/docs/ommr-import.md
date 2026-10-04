# Importing OMMR4all Data

If your manuscript was processed with **OMMR4all**, you can bring its neume positions into the app as snippets instead of drawing them by hand. Open **Import Dataset** (OMMR) in the menu.

## Importing
1. **Select the target manuscript.** Choose one of the manuscripts already in your project, let the app **auto-detect** it from the folder name (for example `Pa_14819` → `Pa 14819`), or enter a new name.
2. **Choose the OMMR folder.** Pick the export directory that contains the `pcgts.json` files (one per page). Colour page images in the folder are used for exact local crops; otherwise the app cuts the snippets from the IIIF images.

The app reads every page, maps the OMMR page names to folios, and lists all neumes by pattern.

## Working with the result
- Browse patterns in the sidebar and look at their snippets.
- Select snippets and **import** them: they are stored in your annotations as snippets inside line regions, like ones you drew yourself. Importing the same selection again adds nothing new.
- The **settings drawer** controls how thumbnails look (context around the neume, markers, IIIF vs. local images), and holds the folio **calibration**, **folio offsets** and **index modes** that line OMMR pages up with your folios. These are saved in your workspace and backups.
- If the manuscript was matched to the wrong source, use **Project Source** in the drawer to remap it.
