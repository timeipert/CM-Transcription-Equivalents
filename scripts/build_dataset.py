#!/usr/bin/env python3
"""
Build a publishable dataset folder from a monodi export.

The Neume Viewer can load datasets from a static host (a GitHub Pages site made
from a separate repository) instead of shipping them inside the app. This script
produces that repository's content for the Corpus Monodicum corpus:

    <out>/
      catalog.json                       the datasets on offer (what the app lists)
      corpus-monodicum/
        dataset.json                     index: one entry per source, with file hashes
        sources/<name>.json              pattern occurrences of one source (as ui/public/sources)
        meta/<name>.json                 one source's catalogue record + its documents

Only whitelisted fields leave the export: personal data (the editors' e-mail
addresses in the documents' additionalData) and internal flags never do. Every
file is listed with its size and SHA-256 so that a client can verify what it
downloaded; everything is plain JSON.

    python scripts/build_dataset.py --corpus export --out ../cm-datasets
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

SCHEMA = 1
DATASET_ID = "corpus-monodicum"

# Source record: export field -> published field.
SOURCE_FIELDS = {
    "quellensigle": "siglum",
    "herkunftsregion": "region",
    "herkunftsort": "place",
    "herkunftsinstitution": "institution",
    "ordenstradition": "tradition",
    "quellentyp": "type",
    "bibliotheksort": "libraryPlace",
    "bibliothek": "library",
    "bibliothekssignatur": "shelfmark",
    "datierung": "date",
    "jahrhundert": "century",
    "kommentar": "comment",
    "beschreibung": "description",
}

# Document record: same names as the Neume Viewer's normalised model.
DOCUMENT_FIELDS = {
    "id": "id",
    "dokumenten_id": "documentId",
    "textinitium": "initium",
    "festtag": "feast",
    "feier": "occasion",
    "gattung1": "genre1",
    "gattung2": "genre2",
    "foliostart": "folioStart",
    "zeilenstart": "lineStart",
    "bibliographischerverweis": "reference",
    "druckausgabe": "edition",
    "editionsstatus": "editionStatus",
    "kommentar": "comment",
}

OCCURRENCE_FORMAT = ["documentId", "folio", "line", "syllable", "pitch"]
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")


def nfc(text):
    return unicodedata.normalize("NFC", text)


def file_name(source_id):
    """A file name for a source id (ids can hold '/', spaces, umlauts)."""
    return nfc(source_id).replace("/", "_")


def write_json(path, value):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    data = text.encode("utf-8")
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def clean(value):
    """A string without surrounding whitespace; anything that looks like an e-mail address is refused."""
    if value is None:
        return ""
    text = nfc(str(value)).strip()
    if EMAIL.search(text):
        raise ValueError(f"personal data in a published field: {text[:60]!r}")
    return text


def pick(record, fields):
    return {out: clean(record.get(src)) for src, out in fields.items() if clean(record.get(src)) != ""}


def manifests_from_excel():
    """Source id -> IIIF manifest URL from the catalogue spreadsheet, if there is one."""
    path = os.path.join(REPO_ROOT, "data/raw/Quellendaten.xlsx")
    out = {}
    if not os.path.exists(path):
        return out
    try:
        import pandas as pd

        df = pd.read_excel(path)
        if "Quellensigle" in df.columns and "Manifest" in df.columns:
            for _, row in df.iterrows():
                if pd.notna(row["Manifest"]):
                    out[nfc(str(row["Quellensigle"]))] = str(row["Manifest"]).strip()
    except Exception as e:  # the spreadsheet is optional
        print(f"Warning: could not read {path}: {e}")
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--corpus", default=os.path.join(REPO_ROOT, "export"), help="the monodi export (one folder per source)")
    parser.add_argument("--out", required=True, help="output folder (the dataset repository)")
    parser.add_argument("--cache", default=os.path.join(REPO_ROOT, "transcription_cache.json"))
    parser.add_argument("--fresh", action="store_true", help="re-analyse the transcriptions instead of using the cache")
    parser.add_argument("--version", default=datetime.date.today().isoformat())
    args = parser.parse_args()

    from analyze_transcriptions import load_or_process_data

    patterns = {nfc(k): v for k, v in load_or_process_data(args.corpus, args.cache, args.fresh).items()}
    excel_manifests = manifests_from_excel()
    out_root = os.path.join(args.out, DATASET_ID)

    entries = []
    warnings = []
    total_docs = total_occ = 0

    folders = sorted(d for d in os.listdir(args.corpus) if os.path.isfile(os.path.join(args.corpus, d, "meta.json")))
    for folder in folders:
        base = os.path.join(args.corpus, folder)
        meta = read_json(os.path.join(base, "meta.json"))
        source_id = nfc(meta.get("id") or folder)
        record = pick(meta, SOURCE_FIELDS)
        manifest = clean(meta.get("manifest")) or excel_manifests.get(source_id, "")
        if manifest:
            record["manifest"] = manifest
        if record.get("siglum", source_id) != source_id:
            warnings.append(f"{source_id!r}: the record's siglum is {record['siglum']!r}")

        documents = []
        for doc_meta in sorted(
            (os.path.join(base, d, "meta.json") for d in os.listdir(base) if os.path.isfile(os.path.join(base, d, "meta.json"))),
        ):
            doc = read_json(doc_meta)
            documents.append(pick(doc, DOCUMENT_FIELDS))
        documents.sort(key=lambda d: (d.get("folioStart", ""), d.get("documentId", "")))

        name = file_name(source_id)
        files = {}
        files["meta"] = {"path": f"meta/{name}.json", **write_json(os.path.join(out_root, "meta", f"{name}.json"), {"source": {"id": source_id, **record}, "documents": documents})}

        occ = patterns.get(source_id) or patterns.get(source_id.replace("#slash", "/"))
        n_patterns = n_occ = n_folios = 0
        if occ:
            n_patterns = len(occ)
            n_occ = sum(len(v) for v in occ.values())
            n_folios = len({o[1] for v in occ.values() for o in v})
            files["patterns"] = {"path": f"sources/{name}.json", **write_json(os.path.join(out_root, "sources", f"{name}.json"), occ)}

        total_docs += len(documents)
        total_occ += n_occ
        entries.append({
            "id": source_id,
            **{k: record[k] for k in ("region", "place", "institution", "tradition", "type", "date", "century") if k in record},
            "hasManifest": bool(manifest),
            "documents": len(documents),
            "documentsEdited": sum(1 for d in documents if d.get("editionStatus") == "ediert"),
            "patterns": n_patterns,
            "occurrences": n_occ,
            "folios": n_folios,
            "files": files,
        })

    entries.sort(key=lambda e: e["id"])
    built = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    dataset = {
        "schema": SCHEMA,
        "id": DATASET_ID,
        "title": "Corpus Monodicum — transcribed sources",
        "description": (
            "Source records and document metadata of every source in the export, and the neume "
            "patterns found in the transcriptions of those that are transcribed."
        ),
        "version": args.version,
        "built": built,
        "license": None,
        "occurrenceFormat": OCCURRENCE_FORMAT,
        "totals": {
            "sources": len(entries),
            "sourcesWithPatterns": sum(1 for e in entries if e["patterns"]),
            "documents": total_docs,
            "occurrences": total_occ,
            "bytes": sum(f["bytes"] for e in entries for f in e["files"].values()),
        },
        "warnings": warnings,
        "sources": entries,
    }
    index_info = write_json(os.path.join(out_root, "dataset.json"), dataset)

    write_json(os.path.join(args.out, "catalog.json"), {
        "schema": SCHEMA,
        "built": built,
        "datasets": [{
            "id": DATASET_ID,
            "title": dataset["title"],
            "description": dataset["description"],
            "version": args.version,
            "license": dataset["license"],
            "kind": "corpus",
            "path": f"{DATASET_ID}/dataset.json",
            **index_info,
            "totals": dataset["totals"],
        }],
    })

    t = dataset["totals"]
    print(f"{t['sources']} sources ({t['sourcesWithPatterns']} with patterns), {t['documents']} documents, "
          f"{t['occurrences']} pattern occurrences, {t['bytes'] / 1e6:.1f} MB -> {args.out}")
    for w in warnings:
        print("warning:", w)


if __name__ == "__main__":
    main()
