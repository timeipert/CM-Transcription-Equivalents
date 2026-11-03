# CM-Transcription-Equivalents (Neume Viewer)

A research tool that maps notation patterns in chant transcriptions to their written shapes in medieval manuscripts, and publishes the result as a notation documentation at https://neume.monodi.app. Work is kept in the browser and, optionally, in a workspace folder: back it up regularly.

Features, storage, scripts and publishing: [GUIDE.md](GUIDE.md). How the pieces fit: [ARCHITECTURE.md](ARCHITECTURE.md).

```bash
cd ui
npm install
npm run dev
npm test && npm run lint && npm run typecheck    # the checks of the CI
```

Node.js 18 or newer; Python 3.10 or newer for `scripts/`.

---

> **Where this code is edited.** The source of this app is the folder `apps/transcription-equivalents` of [timeipert/monodi-platform](https://github.com/timeipert/monodi-platform/tree/main/apps/transcription-equivalents). The repository [timeipert/CM-Transcription-Equivalents](https://github.com/timeipert/CM-Transcription-Equivalents) receives a copy of that folder and deploys it; it is not edited directly (a commit there stops the copy). How the copy works: `docs/sync.md` in monodi-platform.
