#!/usr/bin/env python3
"""Build the data of the Neume Viewer from the Corpus Monodicum export.

What it is for: the Neume Viewer needs the neume patterns of every transcribed source
(`ui/public/sources/<source>.json`), an index with the source list, pattern statistics and
manifest links (`ui/public/index.json`) and a small table of occurrence counts per source and pattern
(`ui/public/counts.json`, which lets the Global Analysis matrix skip the source files). All are derived from the internal export of the Monodi
editor and are **not committed**: the deploy workflow runs this script before it builds the site, so
every deploy shows the edition as it stands in the editor. Locally, run it once to get data for
`npm run dev`.

    python3 scripts/refresh_data.py                       # download the export, build the data, write a report
    python3 scripts/refresh_data.py --export path/to.zip  # a ZIP or an unpacked folder instead
    python3 scripts/refresh_data.py --check               # report only, write nothing under ui/public

What it does:
  1. Gets the export: the ZIP `https://files.corpus-monodicum.de/exportInternal.zip` (no login; all
     sources and documents, with the table of sources, "Quellendaten", as each source's `meta.json`),
     unpacked to `data/export/` (ignored by git). A ZIP downloaded before is reused when the server says
     it did not change.
  2. Analyses every document. There is no cache: `analyze_transcriptions.py` keeps a cache file that
     silently reuses an old analysis, which is why this script never uses it.
  3. Writes `index.json`, `counts.json` and `sources/` (files with unchanged content are left alone; files of sources
     that are no longer in the export are removed).
  4. Compares with a baseline (the data deployed so far: by default the files already in `ui/public/`,
     else the live site) and writes `data/refresh-report.md` and `data/refresh-changes.json`: what changed
     per source and which occurrences moved or vanished. An annotation in the app is linked to an
     occurrence by its row `documentId|folio|line|syllable|notes` (`linkData.sysId`); a row that moved or
     vanished leaves such a link without a target. The report counts them so that nothing happens silently.

Manifest links: `scripts/manifests.json` is the truth file. The `manifest` field of each source in the export
and the table of sources "Quellendaten" (when `--quellendaten` / `$QUELLENDATEN_URL` names it) only fill a
source that is missing there; where they name a different link, the report says so.

Safety: an export with fewer than 80 % of the sources of the baseline is refused as truncated, and a
baseline that cannot be read only switches the comparison off.

See `DATA.md` for the procedure and the checks.
"""
import argparse
import collections
import datetime
import json
import os
import shutil
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import zipfile

import analyze_transcriptions as analysis
from apply_manifest_overrides import apply_overrides, load_manifests

REPO_ROOT = analysis.REPO_ROOT
PUBLIC = os.path.join(REPO_ROOT, "ui", "public")
WORK = os.path.join(REPO_ROOT, "data")  # ignored by git
DEFAULT_EXPORT_URL = "https://files.corpus-monodicum.de/exportInternal.zip"
LIVE_SITE = "https://neume.monodi.app/"
MIN_KEEP = 0.8
EXAMPLES_PER_SOURCE = 5
DETAIL_ROWS_PER_SOURCE = 2000


class RefreshError(RuntimeError):
    pass


# --- Getting the export -----------------------------------------------------------------------

def download(url, target_zip):
    """Download `url` to `target_zip`; skipped when the server's ETag matches the earlier download."""
    etag_file = target_zip + ".etag"
    headers = {"User-Agent": "neume-viewer-refresh-data"}
    if os.path.exists(target_zip) and os.path.exists(etag_file):
        headers["If-None-Match"] = open(etag_file, encoding="utf-8").read().strip()
    request = urllib.request.Request(url, headers=headers)
    os.makedirs(os.path.dirname(target_zip), exist_ok=True)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            size = int(response.headers.get("Content-Length") or 0)
            print(f"Downloading {url} ({size / 1e6:.0f} MB) ...", flush=True)
            partial = target_zip + ".part"
            with open(partial, "wb") as out:
                shutil.copyfileobj(response, out, 1 << 20)
            os.replace(partial, target_zip)
            etag = response.headers.get("ETag")
            if etag:
                with open(etag_file, "w", encoding="utf-8") as f:
                    f.write(etag)
            return response.headers.get("Last-Modified", "")
    except urllib.error.HTTPError as error:
        if error.code == 304:
            print(f"The export did not change since the download in {target_zip}.")
            return ""
        raise RefreshError(f"download of {url} failed: HTTP {error.code}") from error
    except urllib.error.URLError as error:
        raise RefreshError(f"download of {url} failed: {error.reason}") from error


def extract(zip_path, target_dir):
    """Unpack a ZIP into an empty `target_dir`; refuses entries that would land outside of it."""
    if os.path.exists(target_dir):
        shutil.rmtree(target_dir)
    os.makedirs(target_dir)
    root = os.path.realpath(target_dir)
    with zipfile.ZipFile(zip_path) as archive:
        for member in archive.infolist():
            if member.filename.startswith("__MACOSX/"):
                continue
            destination = os.path.realpath(os.path.join(root, member.filename))
            if destination != root and not destination.startswith(root + os.sep):
                raise RefreshError(f"unsafe path in the ZIP: {member.filename!r}")
            archive.extract(member, root)


def find_corpus_root(path):
    """The folder whose subfolders are the sources (each with a meta.json); looks one level down if needed."""
    def has_sources(folder):
        return any(os.path.isfile(os.path.join(folder, d, "meta.json")) for d in os.listdir(folder)
                   if os.path.isdir(os.path.join(folder, d)))

    if has_sources(path):
        return path
    for sub in sorted(d for d in os.listdir(path) if os.path.isdir(os.path.join(path, d)) and d != "__MACOSX"):
        if has_sources(os.path.join(path, sub)):
            return os.path.join(path, sub)
    raise RefreshError(f"no source folders (<source>/meta.json) found in {path}")


def get_export(arg):
    """Resolve --export to (corpus folder, description of where it came from)."""
    if os.path.isdir(arg):
        return find_corpus_root(arg), f"folder {arg}"
    zip_path = arg
    origin = f"ZIP {arg}"
    if arg.startswith(("http://", "https://")):
        zip_path = os.path.join(WORK, "exportInternal.zip")
        modified = download(arg, zip_path)
        origin = arg + (f" (last modified {modified})" if modified else " (unchanged since the earlier download)")
    if not os.path.isfile(zip_path):
        raise RefreshError(f"{arg} is neither a folder, a ZIP file nor a URL")
    target = os.path.join(WORK, "export")
    print(f"Unpacking {zip_path} to {target} ...", flush=True)
    extract(zip_path, target)
    return find_corpus_root(target), origin


# --- Reading what the export says besides the patterns ----------------------------------------

def source_name(raw):
    """A source's name as the analysis and the truth file use it: NFC (the export writes umlauts decomposed), and
    "#slash" for "/" as in folder names."""
    return unicodedata.normalize("NFC", str(raw).strip().replace("#slash", "/"))


def read_export_meta(root):
    """Per source: the manifest link of its record (the table of sources) and, per document id, its genre."""
    out = {}
    for folder in sorted(os.listdir(root)):
        base = os.path.join(root, folder)
        meta_file = os.path.join(base, "meta.json")
        if not os.path.isfile(meta_file):
            continue
        with open(meta_file, encoding="utf-8") as f:
            record = json.load(f)
        name = source_name(record.get("id") or record.get("quellensigle") or folder)
        genres = {}
        for doc in os.listdir(base):
            doc_meta = os.path.join(base, doc, "meta.json")
            if os.path.isfile(doc_meta):
                with open(doc_meta, encoding="utf-8") as f:
                    document = json.load(f)
                genres[str(document.get("dokumenten_id", ""))] = str(document.get("gattung1") or "")
        out[name] = {"manifest": str(record.get("manifest") or "").strip(), "genres": genres}
    return out


# --- The baseline: what is deployed so far ----------------------------------------------------

def file_name(source):
    return source.replace("/", "_") + ".json"


def fetch_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": "neume-viewer-refresh-data"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def load_baseline(spec, public):
    """(source -> patterns, index) of the data deployed so far; ({}, {}) when there is none or it cannot be read.

    `spec`: a folder holding index.json and sources/, a site URL, or "none". Without one: the files already in
    `public`, else the live site.
    """
    if spec == "none":
        return {}, {}
    if spec is None:
        spec = public if os.path.exists(os.path.join(public, "index.json")) else LIVE_SITE
    try:
        if spec.startswith(("http://", "https://")):
            base = spec.rstrip("/") + "/"
            index = fetch_json(base + "index.json")
            rows = {s: fetch_json(base + "sources/" + urllib.parse.quote(file_name(s))) for s in index.get("sources", [])}
        else:
            with open(os.path.join(spec, "index.json"), encoding="utf-8") as f:
                index = json.load(f)
            rows = {}
            for s in index.get("sources", []):
                with open(os.path.join(spec, "sources", file_name(s)), encoding="utf-8") as f:
                    rows[s] = json.load(f)
        print(f"Baseline: {len(rows)} sources from {spec}", flush=True)
        return rows, index
    except (OSError, ValueError, urllib.error.URLError) as error:
        print(f"Warning: no baseline to compare with ({spec}: {error}); the comparison is skipped.", file=sys.stderr)
        return {}, {}


# --- Comparing with the baseline --------------------------------------------------------------

def keyed_rows(patterns):
    """Row key -> (folio, line). The key is the occurrence without its position: pattern, document, syllable,
    notes, and a running number for identical ones, so that a row can be followed when its position changes."""
    seen = collections.Counter()
    out = {}
    for pattern, occurrences in patterns.items():
        for row in occurrences:
            base = (pattern, row[0], row[3], row[4])
            out[base + (seen[base],)] = (row[1], row[2])
            seen[base] += 1
    return out


def diff_source(old, new):
    """What changed between two analyses of one source."""
    before, after = keyed_rows(old), keyed_rows(new)
    removed = sorted(k for k in before if k not in after)
    added = sorted(k for k in after if k not in before)
    moved = sorted(k for k in before if k in after and before[k] != after[k])
    docs_before = {k[1] for k in before}
    docs_after = {k[1] for k in after}
    folios_before = {v[0] for v in before.values()}
    folios_after = {v[0] for v in after.values()}
    return {
        "rows_before": len(before), "rows_after": len(after),
        "removed": [(k, before[k]) for k in removed],
        "added": [(k, after[k]) for k in added],
        "moved": [(k, before[k], after[k]) for k in moved],
        "docs_added": sorted(docs_after - docs_before),
        "docs_removed": sorted(docs_before - docs_after),
        "folios_added": sorted(folios_after - folios_before),
        "folios_removed": sorted(folios_before - folios_after),
    }


def is_unchanged(d):
    return not (d["removed"] or d["added"] or d["moved"])


def canonical(patterns):
    """Deterministic form for writing: patterns sorted, rows of a pattern ordered by document (stable)."""
    return {pattern: sorted(rows, key=lambda row: row[0]) for pattern, rows in sorted(patterns.items())}


# --- Manifest links ---------------------------------------------------------------------------

def read_quellendaten_manifests(spec):
    """Source -> manifest URL from the Manifest column of the table of sources (CSV or Excel; a file or a URL).

    The table is the Google Sheet "Quellendaten" of the project (columns `Quellensigle`, `Manifest`); a URL is
    its "publish to the web" CSV link. An empty `spec` means: no table.
    """
    if not spec:
        return {}
    import pandas as pd
    reader = pd.read_csv if spec.lower().split("?")[0].endswith(".csv") or "output=csv" in spec or "format=csv" in spec else pd.read_excel
    table = reader(spec)
    if "Quellensigle" not in table.columns or "Manifest" not in table.columns:
        raise RefreshError(f"the table of sources {spec} has no columns Quellensigle and Manifest")
    return {source_name(row["Quellensigle"]): str(row["Manifest"]).strip()
            for _, row in table.iterrows() if pd.notna(row["Quellensigle"]) and pd.notna(row["Manifest"]) and str(row["Manifest"]).strip()}


def build_manifests(export_meta, table=None, truth=None):
    """(manifest map, differences). The truth file (scripts/manifests.json) decides; the export's source records and
    the table of sources (when fetched) only fill a source that is missing there. `differences`: (source, truth
    link, other link, where) for every link the export or table names differently, and (source, None, link, where)
    for every one that filled a gap (to be added to the truth file)."""
    if truth is None:
        truth = load_manifests()
    layers = [("export", {s: m["manifest"] for s, m in export_meta.items()}), ("table", table or {})]
    base, differences = {}, []
    for where, links in layers:
        for source, url in sorted(links.items()):
            url = str(url).strip()
            if not url.startswith(("http://", "https://")):
                continue
            have = truth.get(source, {}).get("url")
            if have is None:
                base[source] = {"url": url}
                differences.append((source, None, url, where))
            elif have != url and not (truth[source].get("vendored_from") == url):
                differences.append((source, have, url, where))
    return apply_overrides(base, truth), differences


def manifest_changes(baseline_index, manifests):
    """(source, before, after) where the link differs from the baseline's (None: no link)."""
    before = {s: str(e.get("url", "")).strip() for s, e in baseline_index.get("manifests", {}).items()}
    changes = []
    for source in sorted(set(before) | set(manifests)):
        old = before.get(source)
        new = manifests.get(source, {}).get("url")
        if old != new:
            changes.append((source, old, new))
    return changes


# --- Report -----------------------------------------------------------------------------------

def genre_counts(source, docs, export_meta):
    genres = export_meta.get(source, {}).get("genres", {})
    counts = collections.Counter(genres.get(d, "?") or "?" for d in docs)
    return ", ".join(f"{genre} {n}" for genre, n in counts.most_common())


def render_report(ctx):
    lines = []
    out = lines.append
    out("# Data refresh report")
    out("")
    out(f"Run: {ctx['when']} (UTC). Export: {ctx['origin']}.")
    out(f"Mode: {'check only, nothing under ui/public was written' if ctx['check'] else 'the files under ui/public were written'}.")
    out("")
    out("What this is: the Neume Viewer's data built from the export, compared with the baseline (the data deployed so far). "
        "A **row** is one pattern occurrence `[documentId, folio, line, syllable, notes]`. "
        "An annotation in the app is linked to a row by exactly these five values; see \"Links at risk\".")
    out("")
    out("## Summary")
    out("")
    out("| | baseline | built |")
    out("|---|---:|---:|")
    out(f"| sources with data | {ctx['sources_before']} | {ctx['sources_after']} |")
    out(f"| rows (occurrences) | {ctx['rows_before']} | {ctx['rows_after']} |")
    out(f"| documents with data | {ctx['docs_before']} | {ctx['docs_after']} |")
    out(f"| sources with a manifest link | {ctx['manifests_before']} | {ctx['manifests_after']} |")
    if ctx["has_baseline"]:
        out(f"| sources changed | | {len(ctx['changed'])} |")
        out(f"| sources new | | {len(ctx['new'])} |")
        out(f"| sources no longer in the export | | {len(ctx['absent'])} |")
        out(f"| rows at risk for annotation links (moved or removed) | | {ctx['at_risk']} |")
    out("")
    if not ctx["has_baseline"]:
        out("No baseline could be read (first build, or the live site is unreachable): the data was built, "
            "but nothing is compared and no statement about annotation links is possible.")
        out("")
    if ctx["new"]:
        out("## New sources")
        out("")
        out("| source | documents | rows | manifest |")
        out("|---|---:|---:|---|")
        for source, docs, rows, has_manifest in ctx["new"]:
            out(f"| {source} | {docs} | {rows} | {'yes' if has_manifest else '**none**'} |")
        out("")
    if ctx["changed"]:
        out("## Changed sources")
        out("")
        out("| source | rows before → after | moved | removed | added | documents added (genres) | documents removed |")
        out("|---|---|---:|---:|---:|---|---:|")
        for source, d in ctx["changed"]:
            added = f"{len(d['docs_added'])} ({genre_counts(source, d['docs_added'], ctx['export_meta'])})" if d["docs_added"] else "0"
            out(f"| {source} | {d['rows_before']} → {d['rows_after']} | {len(d['moved'])} | {len(d['removed'])} | {len(d['added'])} | {added} | {len(d['docs_removed'])} |")
        out("")
        out("*moved*: the row exists in both analyses, its folio or line differs (a corrected page break, a changed line start). "
            "*removed* / *added*: the row exists in only one analysis (document edited, added or withdrawn).")
        out("")
    if ctx["has_baseline"]:
        out("## Links at risk")
        out("")
        if ctx["at_risk"] == 0:
            out("No row of the baseline moved or vanished: stored links of annotations keep their targets.")
        else:
            out(f"{ctx['at_risk']} rows of the baseline moved or vanished. An annotation linked to one of them still shows "
                "the old folio and line, but the occurrence list no longer marks it as annotated, and a new annotation of the "
                "same syllable gets the new position. The annotator can re-link the affected pages. Full lists: `data/refresh-changes.json`.")
            out("")
            for source, d in ctx["changed"]:
                if not (d["moved"] or d["removed"]):
                    continue
                out(f"**{source}** — {len(d['moved'])} moved, {len(d['removed'])} removed")
                out("")
                for key, old, new in d["moved"][:EXAMPLES_PER_SOURCE]:
                    out(f"- moved: `{key[1]}` syllable `{key[2]}`: folio {old[0]} line {old[1]} → folio {new[0]} line {new[1]}")
                for key, old in d["removed"][:EXAMPLES_PER_SOURCE]:
                    out(f"- removed: `{key[1]}` syllable `{key[2]}`: folio {old[0]} line {old[1]}")
                out("")
    out("## Manifest links")
    out("")
    if ctx["manifest_changes"]:
        out("Differences from the baseline (a link that went missing is the one to look at first):")
        out("")
        for source, old, new in ctx["manifest_changes"]:
            out(f"- {source}: {old or 'none'} → {new or 'none'}")
        out("")
    elif ctx["has_baseline"]:
        out("No difference from the baseline.")
        out("")
    if ctx["manifest_differences"]:
        out("The export or the table of sources names a link that `scripts/manifests.json` (the truth file) does not have. "
            "A link that fills a gap is used; a different one is not. Put the right link into the truth file:")
        out("")
        for source, have, other, where in ctx["manifest_differences"]:
            out(f"- {source} ({where}): " + (f"truth file has none, {where} names {other}" if have is None else f"truth file {have}, {where} {other}"))
        out("")
    if ctx["without_manifest"]:
        out("Sources with data but no manifest (no scans can be shown): " + ", ".join(ctx["without_manifest"]) + ".")
        out("")
    if ctx["absent"]:
        out("## Sources no longer in the export")
        out("")
        out("They have no data in the built site: " + ", ".join(ctx["absent"]) + ".")
        out("")
    return "\n".join(lines)


# --- Writing the data -------------------------------------------------------------------------

def write_if_changed(path, text):
    if os.path.exists(path) and open(path, encoding="utf-8").read() == text:
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return True


def write_data(public, final, index):
    """Write sources/, index.json and counts.json; leave files with the same content alone; remove files of vanished sources."""
    sources_dir = os.path.join(public, "sources")
    wanted = {file_name(s): s for s in final}
    written = [s for name, s in wanted.items() if write_if_changed(os.path.join(sources_dir, name), json.dumps(final[s]))]
    removed = []
    if os.path.isdir(sources_dir):
        for name in sorted(os.listdir(sources_dir)):
            if name.endswith(".json") and name not in wanted:
                os.remove(os.path.join(sources_dir, name))
                removed.append(name)
    if write_if_changed(os.path.join(public, "index.json"), json.dumps(index)):
        written.append("index.json")
    # The per-source pattern counts of the Global Analysis matrix: lets it render without the source files.
    if write_if_changed(os.path.join(public, "counts.json"), analysis.dump_source_counts(final)):
        written.append("counts.json")
    return written, removed


# --- Main -------------------------------------------------------------------------------------

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--export", default=DEFAULT_EXPORT_URL, help="export ZIP URL, ZIP file or unpacked folder (default: the internal export)")
    parser.add_argument("--public", default=PUBLIC, help="folder to write index.json and sources/ to (default: ui/public)")
    parser.add_argument("--baseline", default=None, help="data deployed so far: a folder, a site URL, or 'none' (default: --public if it holds data, else the live site)")
    parser.add_argument("--quellendaten", default=os.environ.get("QUELLENDATEN_URL", ""), help="the table of sources (CSV/Excel file or URL) for its Manifest column; default: $QUELLENDATEN_URL, else none")
    parser.add_argument("--report", default=os.path.join(WORK, "refresh-report.md"), help="where to write the Markdown report")
    parser.add_argument("--check", action="store_true", help="report only: write nothing under --public")
    args = parser.parse_args(argv)

    root, origin = get_export(args.export)
    export_meta = read_export_meta(root)
    print(f"Export: {len(export_meta)} sources in {root}", flush=True)

    baseline, baseline_index = load_baseline(args.baseline, args.public)
    if baseline and len(export_meta) < MIN_KEEP * len(baseline):
        raise RefreshError(f"the export has {len(export_meta)} sources but the baseline has {len(baseline)}: refusing a truncated export")

    results = analysis.analyze_corpus(root, None)
    fresh = {}
    for name, patterns in results.items():
        for pattern, occurrences in patterns.items():   # two spellings of one name are one source
            fresh.setdefault(source_name(name), {}).setdefault(pattern, []).extend(json.loads(json.dumps(occurrences)))
    if not fresh:
        raise RefreshError("the analysis found no pattern occurrences at all")
    final = {s: canonical(p) for s, p in sorted(fresh.items())}

    new_sources, changed, unchanged = [], [], []
    manifests, manifest_differences = build_manifests(export_meta, read_quellendaten_manifests(args.quellendaten))
    for source in final:
        if source not in baseline:
            if baseline:
                docs = {r[0] for v in final[source].values() for r in v}
                new_sources.append((source, len(docs), sum(len(v) for v in final[source].values()), source in manifests))
            continue
        d = diff_source(baseline[source], final[source])
        (unchanged if is_unchanged(d) else changed).append((source, d))
    absent = sorted(set(baseline) - set(final))

    index = analysis.build_index(final, manifests)
    count_docs = lambda data: len({r[0] for p in data.values() for rows in p.values() for r in rows})  # noqa: E731
    ctx = {
        "when": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M"),
        "origin": origin, "check": args.check, "export_meta": export_meta, "has_baseline": bool(baseline),
        "sources_before": len(baseline), "sources_after": len(final),
        "rows_before": sum(len(r) for p in baseline.values() for r in p.values()),
        "rows_after": sum(len(r) for p in final.values() for r in p.values()),
        "docs_before": count_docs(baseline), "docs_after": count_docs(final),
        "manifests_before": len(baseline_index.get("manifests", {})), "manifests_after": len(manifests),
        "changed": changed, "new": new_sources, "absent": absent,
        "at_risk": sum(len(d["moved"]) + len(d["removed"]) for _, d in changed),
        "manifest_changes": manifest_changes(baseline_index, manifests) if baseline else [],
        "manifest_differences": manifest_differences,
        "without_manifest": [s for s in index["sources"] if s not in manifests],
    }
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w", encoding="utf-8") as f:
        f.write(render_report(ctx))
    details = {s: {
        "moved": [[list(k), list(o), list(n)] for k, o, n in d["moved"][:DETAIL_ROWS_PER_SOURCE]],
        "removed": [[list(k), list(o)] for k, o in d["removed"][:DETAIL_ROWS_PER_SOURCE]],
        "added": [[list(k), list(n)] for k, n in d["added"][:DETAIL_ROWS_PER_SOURCE]],
        "documents_added": d["docs_added"], "documents_removed": d["docs_removed"],
        "folios_added": d["folios_added"], "folios_removed": d["folios_removed"],
    } for s, d in changed}
    with open(os.path.join(os.path.dirname(args.report), "refresh-changes.json"), "w", encoding="utf-8") as f:
        json.dump(details, f, ensure_ascii=False, indent=1)

    if args.check:
        print("Check only: nothing written under", args.public)
    else:
        written, removed = write_data(args.public, final, index)
        print(f"Wrote {len(written)} file(s) under {args.public}, removed {len(removed)}.")
    if baseline:
        print(f"{len(unchanged)} sources unchanged, {len(changed)} changed, {len(new_sources)} new, {len(absent)} no longer in the export; "
              f"rows at risk for annotation links: {ctx['at_risk']}.")
    print(f"Report: {args.report}")


if __name__ == "__main__":
    try:
        main()
    except RefreshError as error:
        print(f"refresh_data: {error}", file=sys.stderr)
        sys.exit(2)
