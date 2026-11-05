# Manuscript scans: status, to-do list and roadmap

**What this is for.** The status of the manuscript scans (IIIF manifests, folio alignment) in the Neume Viewer
(`apps/transcription-equivalents`, before 2026-10-28 the standalone repository `cm-transkriptionseq`), the work that
remains to be done on them, and a proposed roadmap. **Who it is for.** Maintainers of the Viewer and of its data, and the
project's research assistant who reports missing or shifted scans. **Where to start.** Section 3 (roadmap), then sections 2
and 4 (tasks and proposed app work). **Authoritative files.** `scripts/manifests.json` (manifest links) and
`scripts/alignments.json` (default pins), both in this folder; this document only records decisions and open items.

**Terms.** *IIIF* (International Image Interoperability Framework): web standard for serving manuscript images; a *manifest*
is the JSON list of a manuscript's pages (*canvases*, also called scans). *Folio*: a manuscript leaf, `113r` recto and `113v`
verso. *Siglum*: the short code of a source, such as `Aa 13`. *Pin*: a stored statement "this scan is this folio" that
anchors the folio numbering of a whole manuscript. *Alignment*: the mapping of transcribed folios to scans. *Ref-ID /
Transcription Equivalent*: the reference number of a neume pattern for one source. *DIAMM*, *Gallica*, *BSB*, *BL*: online
image collections and libraries (Digital Image Archive of Medieval Music, Bibliothèque nationale de France, Bayerische
Staatsbibliothek, British Library). *CORS*: the browser rule that decides whether a page may fetch data from another
web address. *monodi+*: the transcription platform whose export feeds the Viewer's data.

**State.** Written 2026-10-15 from the research assistant's document ("Tropen zu den Antiphonen der Messe …"), the sources
spreadsheet (IIIF column) and a check of every manifest URL; section 6 is dated 2026-11-03. Sections 1 to 5 are the state of
2026-10-15 unless a passage says otherwise. The first version said "Nothing here has been committed". Check on 2026-11-05
with git (branch `chore/repo-cleanup-2026-11-05`, no uncommitted changes under `apps/transcription-equivalents`): the items
of section 1 are present in the repository, namely `scripts/manifests.json` and `scripts/alignments.json` (commit `bddfd6e1`,
2026-11-03; the first version of the manifest and pin work is commit `5fcbfec5`, 2026-10-15), `splitSpreadLabel` and
`iiifServerLimits` in `ui/src/config/iiifRules.js`, the Roman-numeral reading in `ui/src/utils/folioAlignment.js`,
`ui/scripts/coverage-report.mjs`, the `replaces` handling in `ui/src/stores/iiif.js`, and `ui/src/utils/svgRenderer.js`. The
test count (1141) and the build were not re-run on 2026-11-05. Two names in this document are out of date: the file
`manifest_overrides.json` was replaced by `scripts/manifests.json` and `scripts/alignments.json` (2026-11-03), and
`ui/public/index.json` is generated, not tracked in git (see `DATA.md` in this folder).

## 1. What was done (state 2026-10-15; present in the repository on 2026-11-05)

| What | Where |
|---|---|
| **26 manifests added**, 4 wrong ones corrected, one stray space removed | `scripts/manifests.json` → `ui/public/index.json` |
| `Abb 7` and `Pro 12` pointed at the "(décor)" manifest (46 and 6 scans of decorated pages only). They point at the full manifests (235 / 318 scans): every folio the assistant listed as missing for them is there | same |
| `Lo 4` pointed at BL Royal 4 E IX; the source is **Royal 2 B IV** (the "wrong manuscript" report) | same |
| Pattern signs drawn with **one bracket instead of two** (46+, 23+, 44+, 42+: `[*u][udL]`): adjacent groups were merged into one bracket | `ui/src/utils/svgRenderer.js` + test |
| Openings (two-page spreads) labelled "f. 017v - 018r" / "010v-011r" / "f. 037v - 038" name **both** folios (Abb 7, Aut 183, Pro 12, Mod 7, Mod 16, RoV 52: e.g. 68 folios of Mod 7, Mod 16 and RoV 52 alone showed as "missing") | `ui/src/config/iiifRules.js` (`splitSpreadLabel`) |
| **Roman folio numbers** ("CVIIv") are read as folios. Be 40608 was placed by counting and was off by 2–4 scans; all 41 pages match by label | `ui/src/utils/folioAlignment.js` |
| A **pin re-anchors the scans before it** too (before the 2026-10-15 rework, scans ahead of the pin kept claiming folios the pin contradicts, so "2v" stayed on the old scan) | same |
| Report of folios without a scan, per manuscript | `node ui/scripts/coverage-report.mjs` |
| **Built-in alignments**: pins for Pa 14452, Mü 29307(2, Mü 5539 and Nau I ship with the app (`alignments` in `index.json`, built from `scripts/alignments.json`); a user's own pin on the same scan wins; listed read-only under Settings → Alignment. Tested by 3 scenarios and a check that every shipped pin hits a real scan | `scripts/alignments.json`, `ui/src/stores/settings.js` |
| **Corrected manifests reach existing users**: a link saved in someone's browser stays (it may be their own), unless the data lists it under `replaces` (done for Abb 7, Pro 12, Lo 4) | `ui/src/stores/iiif.js` |

On 2026-10-15 all 1141 tests passed and the app built. `scripts/manifests.json` is the place for manifest decisions and `scripts/alignments.json` the place for default pins (state 2026-11-03); the
spreadsheet `data/raw/Quellendaten.xlsx` is untracked, so the pipeline (`analyze_transcriptions.py`) applies the
overrides on top of it, and `python3 scripts/apply_manifest_overrides.py` re-applies them to `index.json` alone.

## 2. Tasks for maintainers (state 2026-10-15)

### 2.1 Check in the browser (could not be checked by script on 2026-10-15)

* **Pa 1138, Pa 1338** — Gallica's firewall blocks scripts, so these two manifests were not fetched on 2026-10-15 (state 2026-11-05: both are registered in `scripts/manifests.json`; the browser check is not recorded). The identity
  (BnF Latin 1138 / 1338) is confirmed through Biblissima; the URLs follow the pattern of the other 35 Gallica
  manuscripts. Open both in the Manuscripts view.
* **Or 129** — DIAMM lists the Orléans Ms 129 images as `F-SO-129-107`. Look at one page to make sure it is the right book.
* **Ka 5 "Failed to load folio scan"** — not reproducible on 2026-10-15: the manifest, its CORS headers and the image requests
  all answer correctly. The old page placement is the likely culprit (fixed in the alignment rework). If it still
  fails after deploying, the folio is reported to the maintainer.
* **Wo 491 not in "Manuscript Annotations"** — the sidebar lists every transcribed source, so this is probably the
  deployed build. Re-check after the first deploy that follows 2026-10-15.

### 2.2 Pins

Counting scans cannot know where the numbering starts; one pin fixes a whole manuscript. The first four are **built in** (nobody has to set them); the research assistant's values still need a look on the image — if one is wrong, correct it in `scripts/alignments.json` (named `manifest_overrides.json` in the first version of this document) and run `python3 scripts/apply_manifest_overrides.py`.

| Manuscript | Pin |
|---|---|
| Mü 29307(2 | scan `(0005)` = **2r** (the manifest has only 9 scans: **4v has no scan**) |
| Mü 5539 | scan `(0142)` = **69r** (on the registered manifest bsb00042722; as the assistant reports it — confirm on the image) |
| Nau I | scan `phys_Chorbuch_0025` = **13r** (the printed volume's foliation differs from the manuscript's; see p. 280) |
| Pa 14452 | every Gallica label is "NP"; one pin (the existing scenario: scan 12 = 139r) places all 243 pages |
| Mü 4101, Sal 20, Pia 65, Sol 596, Ei 610 | placed by counting only; check one known page each |

The rest need a pin set by the person who checks them (Manuscripts view → alignment review), or an entry in `scripts/alignments.json` once the value is known. State 2026-11-05: `scripts/alignments.json` also holds pins for Mü 4101 and Pia 65 (see section 6). A user cannot delete a built-in pin, only pin that scan to another folio (or to "not a page").

### 2.3 Corrections in the sources spreadsheet

* `Abb 7`: the IIIF column has the full manifest, but `Quellendaten.xlsx` had the "décor" one (overridden in `scripts/manifests.json`).
* `Köln D`: the link `…/zoom/263799` is a page of the same Drachenfels-Missale; the registered manifest (263341) is right.
* `Mü 5539`, `Mü 9508`: the sheet has the newer BSB digitisations (bsb00079147, bsb00079148, with covers: 398 / 625 scans);
  the app has the older ones (391 / 636 scans, no covers). Both are valid. **Switching moves every scan number**, so
  they were left unchanged; switching is only advisable together with fresh pins.
* Names differ between sheet and data: `Go I` / `Go I (J)`, `Scan 7` / `Sca7` / `SCan 7`.
* Sheet rows without a transcription (state 2026-10-15), but with manifests available: Ben 35, Ben 39 (DIAMM), Bo 2824 (DIAMM), Ox 358 (Bodleian), Pa 1112, Pa 1139 (Gallica), Mü 9508.
* `Be 40608`: folio `10r` exists twice in the scan (Roman "Xr" and the second, Arabic foliation). The app picks the Roman one.

### 2.4 Scans that do not exist online — digitisation or another source

| Manuscript | Missing |
|---|---|
| Rou 250 (Jumièges) | 17, 17v, 18. The DIAMM manifest has only 11 scans (27v–170v); not registered |
| Mod 7 | 204v and later (25 folios). DIAMM's film ends at 201 scans |
| Aa 13 | 169v, 170, 170v (the manifest ends at 169r) |
| Be 792 | 152v, 153 (assistant's note; the app finds no scan labelled so in the SBB manifest) |
| Pa 1107 | 145r, 145v, 146r |
| Ma 289 | 148v, 155v, 156r |
| Lo 4 | f. 213 |
| Cai 72 | 15v, 16, 16v (maybe on the institute drive at the Rechenzentrum, "BSA") |
| Ver 10 | 155v, 156 |
| La 263 | 21v, 22r, 106r (no manifest; see 2.5) |
| No scans at all | Apt 17, SCan 7, Ba 45, Civ 41/56/79/101/102, Pad 16/47/55/56/1340, Parm 01/05/12, Halb 45, Int 5, Nvr G3, Pre 2, WiSch 4/5, Si 29, Eng 314, Rou 222, Tsa 135, Go I (J), AcT 1, Bar 888, SeZ 2, Pa 905, Lo 23935 ("not available") |

(`Pro 12`, `Abb 7`, `Aut 183`: the assistant's missing-folio lists are all resolved by the corrected manifests.)

### 2.5 Libraries without IIIF — leads for scraping (public domain)

| Manuscript | Lead |
|---|---|
| Wo 491 | HAB `diglib.hab.de/mss/491-helmst/start.htm` — no IIIF found; 5 folios needed (12r, 17v, 18r, 83v, 84r) |
| Ass 695 | Internet Culturale (ICCU) — no manifest at the guessed URL; viewer is JavaScript |
| AugW 13 | UB Augsburg via `urn:nbn:de:bvb:384-uba003097-3` (6 folios) |
| Bo 7 | `museibologna.it/musica/viewschedatwbca/&path=/images/ripro/gaspari/_Q/Q007/` (9 folios) |
| Ven 4 | `smcfava.regione.veneto.it/man_per/cod_71.htm` (static pages) |
| La 263, Or 201, Mil 25 | library viewers (Laon `idurl/1/1461`; Biblissima `…mdata3c5074c6…`; Veneranda) — probably IIIF behind JavaScript: open the viewer, look for "Manifest" / the IIIF icon in the browser's network tab |
| Ma 19421, Ma 20-4 | Biblioteca Digital Hispánica refuses scripted access (HTTP 403); use a browser |
| Ut 417 | Utrecht manifests look like `objects.library.uu.nl/manifest/iiif/v2/1874-<id>`: find the object id of Hs 417 in the catalogue |
| NY 905 | "Geese Book" project site `geesebook.asu.edu`; the Morgan record `themorgan.org/manuscript/159920` |
| MüU 156 | LMU repository `epub.ub.uni-muenchen.de/11079/`: one ~1 GB PDF, no IIIF — convert to images |

### 2.6 Fixes that belong in monodi+ (not in this app)

* The line a document starts on is wrong in the metadata (details in the assistant's document, "Fehler bei der Zeilennummerierung" and the folio notes): Ox 340 (f. 18r, 19v, 23r), Ei 610 (610-609-15 and 610-610-16 should start on 13), Köln D (25a should be line 14; 22b, 24v), Sal 20 (pages numbered as folios, "Foliostart 15").
* "Monodi Data Available" missing on Pa 1235 (9r, 18v, 20r, 34r, 76r, 88r, 184r, 210r, 230r) and Aut 183 (6v, 37v, 38r).
* Pattern library: no Transcription Equivalent 71 `[*Ou]` (Mü 29307(2) — Andreas Pfisterer's answer: enter as Quilisma without a comment; delete the comment that was already entered. The glyph bug is fixed in this repository (state 2026-10-15); if the Equivalents site (timeipert.github.io/CM-Transcription-Equivalents) is built from somewhere else, it needs the same fix.

## 3. Roadmap

1. **Deploy** the tree of 2026-10-15 (manifests, glyph fix, alignment). Ask the assistant to re-test Wü 165, Sal 20 ("added lines not shown"), Ka 5, Wo 491.
2. **Check the built-in pins** (2.2) on the images, and add pins for the manuscripts that lack them.
3. **Browser checks** (2.1), then register what is found in `manifest_overrides.json`.
4. **Digitisation requests** (2.4), starting with the manuscripts that are nearly done: Aa 13, Be 792, Pa 1107, Ma 289, Lo 4, Mod 7.
5. **Scraping / static manifests** (2.5) for the 6–8 libraries without IIIF.
6. **monodi+ corrections** (2.6).

## 4. Proposed app work (not done, state 2026-10-15; the owner of the Neume Viewer decides)

1. **Several Ref IDs per pattern** (Köln D: the pattern is 73 *and* 81; on 2026-10-15 the app allows one number per pattern).
2. **A comment next to a pattern** (Ful 62: Notator A/B, 10 a/b, 12, 81).
3. **Per-document line-start correction** in the app, so monodi+ errors (2.6) do not block the work.
4. **A generator for static IIIF manifests** from an image-URL pattern, for the libraries in 2.5.
5. **Tell the user why a folio has no image** ("this manuscript's scans end at 169r") instead of "Failed to load folio scan".

## 5. Generated report (`node ui/scripts/coverage-report.mjs`; snapshot of 2026-10-15)

## Transcribed folios without a scan (7 manuscripts)

| Manuscript | Scans | Pages transcribed | Without scan | Which |
|---|---:|---:|---:|---|
| Aa 13 | 348 | 181 | 4 | 169v, 170, 170r, 170v |
| Be 792 | 291 | 4 | 3 | 152v, 153, 153r |
| Lo 4 | 428 | 165 | 1 | 213 |
| Ma 289 | 295 | 64 | 3 | 148v, 155v, 156r |
| Mod 7 | 201 | 83 | 25 | 204v, 205r, 205v, 206r, 206v, 207r, 207v, 208r, 208v, 209r, 209v, 210r, 210v, 211r, 211v, 212r, 219r, 219v, 220r, 220v, 221r, 222r, 222v, 223r, … (1 more) |
| Pa 1107 | 415 | 3 | 3 | 145r, 145v, 146r |
| Pa 14452 | 263 | 243 | 243 | 139r, 139v, 140, 140r, 140v, 141r, 141v, 142r, 142v, 143, 143r, 143v, 144, 144v, 145, 145v, 146, 146r, 146v, 147, 147r, 147v, 148, 148r, … (219 more) |

## Placed by counting scans, not by their labels (8 manuscripts)

| Manuscript | Pages | By label | By counting | Approximate |
|---|---:|---:|---:|---:|
| Ei 610 | 2 | 0 | 0 | 2 |
| Mü 29307(2 | 6 | 0 | 6 | 0 |
| Mü 4101 | 30 | 0 | 30 | 0 |
| Mü 5539 | 2 | 0 | 2 | 0 |
| Nau I | 14 | 0 | 14 | 0 |
| Pia 65 | 59 | 0 | 59 | 0 |
| Sal 20 | 3 | 0 | 3 | 0 |
| Sol 596 | 53 | 0 | 45 | 8 |

*47 transcribed manuscripts have no manifest at all; the biggest are Apt 17 (263 pages), SCan 7 (203), MüU 156 (189), Ut 417 (105), Ma 19421 (93), Pad 16 (82), La 263 (78), Ass 695 (77), Tsa 135 (77), Or 201 (68). The script prints the full list.*

*Note:* if monodi.app's shared metadata lists a manifest for a source, it overrides the one in `index.json` (`metadataProvider.js`). Check that Abb 7, Pro 12 and Lo 4 are not wrong there (open, not checked on 2026-11-05).

## 6. Report of the research assistant, state 2026-11-03

| Manuscript | Problem | State 2026-11-03 |
|---|---|---|
| Be 664 | a page break wrongly marked in the edition (corrected in the editor) | fixed by the build from the export: 38 rows moved from 155r to 155v |
| Dar 868 | images missing | manifest replaced by the colour digitisation 00006738; pages named from the canvas position (`iiifRules.js`) |
| Lü 11 | images missing | the image server refuses `full`: sizes limited (`iiifServerLimits`) |
| Mel 109 | images missing | the manifest server sends no CORS header: a copy of the manifest ships in `ui/public/manifests/` |
| Mü 4101 | pages shifted | pin: canvas 346, scan (0347), is 170r (checked on the images) |
| Pia 65 | pages shifted | pin: canvas 117, scan 118, is 151v (from the report; not checked on the image) |
| Pst 121, RoC 1741 | only sequences in the notation documentation | the export holds 31 tropes each; the build includes them |
| Vat 3797 | line numbers shifted by 4 | rule `rubric_page_break` for this source (`scripts/analysis_rules.json`) |
| To 18 | pages shifted | **open**: the manifest labels run without a gap; one known page (scan label and folio) is needed |
| Vce 56 | pages shifted | **open**: the manifest labels jump at 2r → 3v and 22 more places; whether labels are wrong or scans are missing needs a known page after each jump |
