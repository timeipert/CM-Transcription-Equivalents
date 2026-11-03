# Data of the Neume Viewer: where it comes from and how to refresh it

State: 2026-11-03. For whoever maintains the Neume Viewer (this folder) or the notation documentation made with it.

## What it is for

The Neume Viewer lists the neume patterns of every transcribed source of the Corpus Monodicum (CM, an edition of medieval monophonic
chant). That needs two kinds of files in `ui/public/`:

| File | Content |
|---|---|
| `sources/<source>.json` | the occurrences of every pattern in one source: `{pattern: [[documentId, folio, line, syllable, notes], ...]}` |
| `index.json` | list of sources, pattern statistics, glyphs, manifest links (IIIF, the standard for digitised manuscript images) and default alignments |

**Neither is stored in git.** The Corpus Monodicum export has one place, `https://files.corpus-monodicum.de/exportInternal.zip`
(all sources and documents of the Monodi editor, with the table of sources "Quellendaten" as the `meta.json` of each source; no login,
about 230 MB). The deploy workflow (`.github/workflows/pages.yml`, runs in the mirror repository) downloads it on every run, builds
both files with `scripts/refresh_data.py` and publishes the site. No copy of the export is committed, uploaded as an artifact or cached.

## Refreshing the data of the site

The site shows the edition as it stood at the last deploy. To bring in a change made in the editor (a corrected page break, a newly
released document): Actions → *Deploy to GitHub Pages* → *Run workflow* in the mirror repository
`timeipert/CM-Transcription-Equivalents`. The job summary shows the report (below). A deploy that fails (export unreachable, analysis
error) leaves the site as it was.

## Refreshing the data locally

```bash
cd apps/transcription-equivalents
pip install ./scripts/                 # monodikit, pandas, ...
python3 scripts/refresh_data.py        # download, build, write data/refresh-report.md
python3 scripts/refresh_data.py --check              # report only, writes nothing under ui/public
python3 scripts/refresh_data.py --export export.zip  # a ZIP or an unpacked folder instead of the download
```

It takes about two minutes. `data/` is ignored by git.

## What the build does

1. Downloads and unpacks the export (`data/export/`).
2. Analyses the documents of the corpus edition (`scripts/analysis_rules.json`, rule `document_scope`: subcorpus `edition`; documents
   whose id ends in `TR` or `GS` are skipped, as before). There is no cache.
3. Writes `ui/public/sources/` and `index.json`.
4. Compares with the **baseline**, the data deployed so far (the files already in `ui/public/`, else the live site
   https://neume.monodi.app/), and writes `data/refresh-report.md` and `data/refresh-changes.json`.

### Reading the report

A **row** is one occurrence `[documentId, folio, line, syllable, notes]`. An annotation made in the app is linked to a row by these five
values (`linkData.sysId`). The report counts, per source, rows that **moved** (same row, other folio or line: a corrected page break)
and rows that were **removed** (document edited or withdrawn). Annotations on such rows keep their old folio and line, but the
occurrence list no longer marks them as annotated. The annotator can re-link the pages; nothing is lost silently.

## Where each decision lives

| Decision | File |
|---|---|
| Which documents are analysed; how a double bar `||` in a rubric counts (page change, not two line changes) | `scripts/analysis_rules.json` |
| Manifest link of a source (the **truth file**: 106 sources, each with its origin and, for decisions, a note); manifests copied because their server has no CORS header | `scripts/manifests.json`, `scripts/vendor_manifests.py` |
| Default pins of a source (which scan shows which folio) | `scripts/alignments.json` |
| Label rules of a library (wrong page numbers, no labels), size limits of an image server | `ui/src/config/iiifRules.js` |

The truth file `manifests.json` decides which manifest a source uses. The `manifest` field of the source in the export and the table
"Quellendaten" (when the repository variable `QUELLENDATEN_URL` holds the "publish to the web" CSV link of the Google Sheet) only fill a
source that is missing there; where they name a different link, the report lists it, so that the truth file can be corrected. The file
was filled on 2026-11-03 from the earlier spreadsheet (74 links), the export (2 links, both already there) and the manual decisions (30).

## State and open points (2026-11-03)

| # | Point | Who decides |
|---|---|---|
| 1 | A new manifest link has one place: `scripts/manifests.json`. The export's source records hold a manifest for only 2 sources; when the Manifest column of the table "Quellendaten" is uploaded to the editor (CM-hub, `cm sources upload`) or `QUELLENDATEN_URL` is set, the report shows new links to adopt. | maintainer of CM-hub |
| 2 | Documents with `publish: none` (749 in the edition on 2026-11-03, among them the tropes of RoC 1741) are in the data, and the data of the site is public. Restrict `publish` in `analysis_rules.json` if they should not be. | project direction |
| 3 | The double-bar rule is on for Vat 3797 only. The same rubric form occurs in about 270 rubrics of other sources; switching the rule on for them renumbers their lines and moves annotation links. | owner of the Neume Viewer with the research assistant |
| 4 | `packages/core/src/document/pattern.ts` counts bars in rubrics the same way (line numbers of Monodi-Zero's own analysis). | maintainer of Monodi-Zero |

## Checks

- `pytest tests/` (Python: rules, comparison, manifest layers) and `cd ui && npm test` (alignment of folios to scans).
- `python3 scripts/vendor_manifests.py --check` reports copied manifests that differ from the library's.
- `node ui/scripts/coverage-report.mjs` lists transcribed folios without a scan (needs the built data).
