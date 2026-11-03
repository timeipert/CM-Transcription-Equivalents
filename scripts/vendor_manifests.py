#!/usr/bin/env python3
"""Copy IIIF manifests that a browser cannot load into ui/public/manifests/.

A browser may fetch a manifest from another site only if that site answers with an
`Access-Control-Allow-Origin` header (CORS, the browser's cross-site rule). Some
library servers send none; the images then load, but the manifest does not and the
manuscript shows no page. For such a source, scripts/manifests.json (the truth file of manifest links) holds

    "Mel 109": {"url": "manifests/Mel-109.json", "vendored_from": "https://.../manifest", ...}

`url` is the path the app loads, relative to the site (the file lives in
ui/public/manifests/); `vendored_from` is where the copy comes from. This script
downloads every entry that has `vendored_from` and writes the manifest compactly.

    python3 scripts/vendor_manifests.py           # download and write the copies
    python3 scripts/vendor_manifests.py --check   # report copies that differ from the library's manifest

Exit status of --check: 1 when a copy is missing or differs, so a scheduled run can flag it.
"""
import json
import os
import sys
import urllib.request

from apply_manifest_overrides import load_manifests

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(REPO_ROOT, "ui", "public")


def vendored(overrides):
    """Source -> (path under ui/public, upstream URL) for every override that names `vendored_from`."""
    out = {}
    for source, entry in overrides.items():
        if isinstance(entry, dict) and entry.get("vendored_from") and entry.get("url"):
            out[source] = (entry["url"], entry["vendored_from"])
    return out


def fetch_manifest(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (vendor_manifests.py)"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def compact(manifest):
    return json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n"


def main():
    check = "--check" in sys.argv[1:]
    stale = []
    for source, (path, upstream) in sorted(vendored(load_manifests()).items()):
        target = os.path.join(PUBLIC, path)
        text = compact(fetch_manifest(upstream))
        current = open(target, encoding="utf-8").read() if os.path.exists(target) else None
        state = "missing" if current is None else ("unchanged" if current == text else "differs")
        print(f"{source}: {path} {state} ({len(text) // 1024} KB from {upstream})")
        if state != "unchanged":
            stale.append(source)
            if not check:
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with open(target, "w", encoding="utf-8") as f:
                    f.write(text)
    if check and stale:
        sys.exit(1)


if __name__ == "__main__":
    main()
