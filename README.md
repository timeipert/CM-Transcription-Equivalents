# CM-Transcription-Equivalents (Neume Viewer)

A research tool that maps notation patterns in chant transcriptions to their written shapes in medieval manuscripts, and publishes the result as a notation documentation at https://neume.monodi.app. Work is kept in the browser and, optionally, in a workspace folder: back it up regularly.

Features, storage, scripts and publishing: [GUIDE.md](GUIDE.md). How the pieces fit: [ARCHITECTURE.md](ARCHITECTURE.md).

The data (patterns of every source, manifest links) is built from the Corpus Monodicum export and not stored in git: run `pip install ./scripts/ && python3 scripts/refresh_data.py` once for local data; every deploy rebuilds it. See [DATA.md](DATA.md).

```bash
cd ui
npm install
npm run dev
npm test && npm run lint && npm run typecheck    # the checks of the CI
```

Node.js 18 or newer; Python 3.11 or newer for `scripts/` (`requires-python` in `scripts/pyproject.toml`).

## Where to start (a guide for newcomers)

State 2026-11-05. Two parts: a Python pipeline (`scripts/`) that builds the data from the Corpus Monodicum export,
and the Vue 3 application (`ui/`) that shows it.

| Folder or file | What it holds |
|---|---|
| `ui/` | The app (Vue 3 and Vite). `src/views/` are the pages, `src/components/` the parts of a page, `src/composables/` the shared logic, `src/stores/` the Pinia stores, `src/services/` and `src/utils/` plain functions (alignment of scans to folios, IIIF, persistence, sync), `src/router/` the routes. Tests sit next to the code as `*.test.js`. |
| `ui/public/` | Files served as they are, including the generated data (`index.json`, `counts.json`, `sources/`; not in git, see `DATA.md`) and `manifests/` (copies of IIIF manifests whose servers send no CORS header). |
| `scripts/` | The Python data pipeline: `refresh_data.py` (download and build), `analyze_transcriptions.py`, `logic.py`, `manifests.json` (the truth file for manifest links and default pins), `analysis_rules.json`. |
| `tests/` | The Python tests (`pytest tests/`, as in CI). |
| `glyphs/` | SVG files of the pattern glyphs, read by the pipeline. |
| `user-manual/` | The VitePress user manual; `npm run build:manual` copies it to `ui/public/manual`. |
| `GUIDE.md`, `ARCHITECTURE.md`, `DATA.md` | Features and publishing; how the pieces fit; how the data is built. |
| `MANUSCRIPT-TODO.md` | The open work list for manuscript scans, pins and digitisation requests (state 2026-11-03). Read it before touching manifest data. |

How to run and check it:

```bash
# user interface
cd ui && npm ci
npm run dev
npm test -- --run && npm run lint && npm run typecheck && npm run build

# data pipeline and its tests (Python version: see requires-python in scripts/pyproject.toml)
pip install pytest ./scripts/
python3 scripts/refresh_data.py       # builds the data into ui/public
pytest tests/
```

Files that are not used by the app are not deleted but moved to `archive/transcription-equivalents/` at the root of
the monorepo (see the README there for the list and the reasons).

---

> **Where this code is edited.** The source of this app is the folder `apps/transcription-equivalents` of [timeipert/monodi-platform](https://github.com/timeipert/monodi-platform/tree/main/apps/transcription-equivalents). The repository [timeipert/CM-Transcription-Equivalents](https://github.com/timeipert/CM-Transcription-Equivalents) receives a copy of that folder and deploys it; it is not edited directly (a commit there stops the copy). How the copy works: `docs/sync.md` in monodi-platform.
