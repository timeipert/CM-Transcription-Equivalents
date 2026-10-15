#!/usr/bin/env python3
"""Apply scripts/manifest_overrides.json to ui/public/index.json.

The Manifest column of the (untracked) Quellendaten.xlsx feeds index.json when
analyze_transcriptions.py runs; the overrides file is the tracked place for
manifest decisions made since. This script re-applies them without re-running
the whole analysis, and strips stray whitespace from every URL.

    python3 scripts/apply_manifest_overrides.py            # rewrite index.json
    python3 scripts/apply_manifest_overrides.py --check    # only report what would change
"""
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(REPO_ROOT, "ui", "public", "index.json")
OVERRIDES = os.path.join(REPO_ROOT, "scripts", "manifest_overrides.json")


def load_file(path=OVERRIDES):
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_overrides(path=OVERRIDES):
    return load_file(path).get("manifests", {})


def load_alignments(path=OVERRIDES):
    """Source -> {"dataType"?, "pins"}: the alignments that ship with the app (notes dropped)."""
    out = {}
    for source, entry in load_file(path).get("alignments", {}).items():
        shipped = {k: v for k, v in entry.items() if k in ("dataType", "iiifType", "offset", "pins")}
        if shipped.get("pins"):
            out[source] = shipped
    return out


def apply_overrides(manifests, overrides):
    """Return a new manifest map: stripped URLs, overrides applied. Source -> {"url": ...}."""
    out = {}
    for source, entry in manifests.items():
        url = str(entry.get("url", "")).strip()
        if url:
            out[source] = {"url": url}
    for source, entry in overrides.items():
        url = entry if isinstance(entry, str) or entry is None else entry.get("url")
        if url is None or not str(url).strip():
            out.pop(source, None)
        else:
            out[source] = {"url": str(url).strip()}
            replaces = [str(u).strip() for u in (entry.get("replaces", []) if isinstance(entry, dict) else []) if str(u).strip()]
            if replaces:
                out[source]["replaces"] = replaces
    return out


def main():
    check = "--check" in sys.argv[1:]
    with open(INDEX, encoding="utf-8") as f:
        index = json.load(f)
    before = index.get("manifests", {})
    after = apply_overrides(before, load_overrides())
    added = sorted(set(after) - set(before))
    removed = sorted(set(before) - set(after))
    changed = sorted(s for s in after if s in before and after[s] != before[s])
    print(f"added {len(added)}: {', '.join(added)}")
    print(f"changed {len(changed)}: {', '.join(changed)}")
    print(f"removed {len(removed)}: {', '.join(removed)}")
    print(f"default alignments: {', '.join(sorted(load_alignments()))}")
    if check:
        return
    index["manifests"] = dict(sorted(after.items()))
    index["alignments"] = dict(sorted(load_alignments().items()))
    with open(INDEX, "w", encoding="utf-8") as f:
        json.dump(index, f)


if __name__ == "__main__":
    main()
