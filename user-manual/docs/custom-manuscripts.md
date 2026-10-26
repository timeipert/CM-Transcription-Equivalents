# Custom Manuscripts

**Custom Manuscripts** is the lightweight path for documenting a notation **without IIIF, folios, line regions or polygons**: you paste or upload snippet images directly.

- A **collection** is a named source with its own list of patterns (declared by code) and its images.
- Add snippets by pasting or uploading images, give each a pattern, an optional Ref ID, variant and caption.
- Collections can be **published**, which makes them appear in the public documentation like annotated manuscripts.

Snippet images can be large, so they are kept in a separate file in your workspace folder (`direct-snippets.json`) and in the browser's database, and are included in backups.

## Proofreading: PDF and JSON for one manuscript

Each custom manuscript can be handed to someone else to check. Open the manuscript in **Custom Manuscripts** and use the **Proofreading** block (below the title and notes):

| Button | What it gives you | Use it for |
|---|---|---|
| **Save as PDF** | A printable copy: title and notes, then every declared pattern with its notation drawn from the code, the code, the label, and each snippet image with its Ref ID, caption and a tick box. Snippets without a pattern follow under *Unassigned*. | Printing, ticking snippets that are filed correctly, writing corrections by hand. |
| **Save as JSON file** | One file holding only this manuscript, **images included**. | Sending the manuscript to a colleague who corrects it in the app. |

### Round trip with a proofreader

1. **You** save the JSON file (and the PDF, if the proofreader prefers paper) and send it.
2. **The proofreader** opens **Settings → Share / Backup → Import Backup / Manuscript File** and chooses the file. The manuscript appears under **Custom Manuscripts**, where captions, Ref IDs, patterns and the pattern of each snippet can be corrected.
3. **The proofreader** opens the manuscript and saves it again with **Save as JSON file**, then sends that file back.
4. **You** import the returned file the same way. Because the manuscript already exists, the app asks per manuscript what to do, showing the number of snippets and patterns on both sides:
   - **Skip**: keep your version.
   - **Import as Copy**: keep both; the returned one gets the siglum "… (copy)" and is not published, so the two can be compared.
   - **Overwrite Local**: replace your version with the returned one.

A manuscript counts as the same one when it has the same internal id **or** the same siglum (upper and lower case and surrounding spaces are ignored).

### Do manuscripts have to be proofread before they are published?

The app does not require it: **Publish** is a separate switch and does not depend on any proofreading step. Whether an unchecked manuscript may be uploaded to the corpus is a decision for the editors of the corpus, not something the app enforces. A manuscript that is still being checked can be left unpublished, and published after the corrected file has been imported.

### Limits

- The PDF needs at least one snippet; a manuscript without images has nothing to print.
- The JSON file carries the manuscript's own data only. Source metadata (the fields under Settings) and app settings stay in each person's workspace.
- The full backup (**Settings → Share / Backup**) still includes every custom manuscript.
