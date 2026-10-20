# Export API

`window.cmExportApi` is the programmatic entry to the static-site export (Settings → "Download static site"),
made for automation such as the Corpus Monodicum pipeline. It is a function on the page, so it is deployed
with the app (https://neume.monodi.app) and needs no server.

```js
const result = await window.cmExportApi.exportSite({
    backups: [{ name: 'Aa-13.json', text: '<contents of a backup / manuscript file>' }],
    options: { publish: 'all', itemSnippets: false, neumeTable: false }
})
// result = { apiVersion, summary: { sources, snippets, failures }, imported: ['Aa 13'], zipBase64, bytes }
```

* It imports the files like Settings → "Import Backup / Manuscript File" (overwriting what is there).
* `options.publish`: `'file'` (default) publishes what the files mark as published, `'all'` every imported manuscript.
* `options.only`: array of source names. `itemSnippets: false` skips the per-item crops (fast, line photos stay),
  `neumeTable: false` leaves `neumentabelle.*` out.
* Returns the ZIP as base64 instead of downloading it. One export at a time; errors are thrown with a readable message.
* `window.cmExportApi.apiVersion` is bumped for breaking changes - check it before relying on a field.

Headless (Playwright, Python) - the whole call:

```python
page.goto("https://neume.monodi.app/")
result = page.evaluate("async req => await window.cmExportApi.exportSite(req)", {"backups": [...], "options": {...}})
zip_bytes = base64.b64decode(result["zipBase64"])
```

The default behaviour of the Settings button is unchanged (`exportStaticSite(onProgress, options)` only gained options).
Tests: `src/api/exportApi.test.js`.
