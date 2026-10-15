/**
 * Runs every scenario of fixtures/alignment-scenarios.json against the real app
 * code: the stores, the import, the page-key migration and the Manuscripts view's
 * composable (useManagerWorkspace) — the same path a person's click takes.
 * Add a scenario to the JSON file to cover a new situation; no code needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { effectScope, reactive, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../../utils/directSnippetsDb', () => ({ loadCollections: async () => [], saveCollections: async () => true }));
vi.mock('../../services/metadata/metadataProvider', () => ({
    loadOverviewMetadata: async () => ({ stats: {}, glyphs: {}, manifests: {}, overallMax: 0, sourceFolios: {}, documents: [], sourceMeta: {}, metadataSource: 'static' })
}));

import { useAnnotationsStore } from '../../stores/annotations';
import { useIiifStore } from '../../stores/iiif';
import { useSettingsStore } from '../../stores/settings';
import { useTranscriptionData } from '../../composables/useTranscriptionData';
import { useImageManifest } from '../../composables/useImageManifest';
import { useManagerWorkspace } from '../../composables/useManagerWorkspace';
import { useDataManagement } from '../../composables/useDataManagement';
import { initPageKeyMigration } from '../../composables/usePageKeyMigration';
import { parseManifest } from '../../services/iiif/manifestParser';
import { labelRuleFor } from '../../config/iiifRules';
import { loadCorpus, corpusPages } from './corpusPages';
import { createFakeStorage } from '../fakes';

const fixtures = new URL('../fixtures/', import.meta.url);
const { scenarios } = JSON.parse(readFileSync(fileURLToPath(new URL('alignment-scenarios.json', fixtures)), 'utf8'));
const corpus = loadCorpus();

const settle = async () => { for (let i = 0; i < 5; i++) { await nextTick(); await new Promise(r => setTimeout(r, 0)); } };

function pagesFromLabels(source, labels) {
    return parseManifest({
        '@context': 'http://iiif.io/api/presentation/2/context.json',
        sequences: [{ canvases: labels.map((label, i) => ({ label, images: [{ resource: { service: { '@id': `https://img.test/${i}` } } }] })) }]
    }, { labelRule: labelRuleFor(source) });
}

let scope;
beforeEach(() => {
    globalThis.localStorage = createFakeStorage();
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    setActivePinia(createPinia());
    scope = effectScope(true);
});
afterEach(() => {
    scope.stop();
    vi.restoreAllMocks();
});

/** Set up the app as the scenario describes and run the page-key migration. */
async function arrange(scenario) {
    const source = scenario.manuscript || scenario.source;
    const fromCorpus = scenario.manuscript ? corpus[scenario.manuscript] : null;
    if (scenario.manuscript && !fromCorpus) throw new Error(`"${scenario.manuscript}" is not in the corpus fixture`);

    const pages = fromCorpus ? corpusPages(source, fromCorpus)
        : scenario.labels ? pagesFromLabels(source, scenario.labels) : null;
    const dataFolios = (scenario.dataFolios ?? fromCorpus?.dataFolios ?? []).filter(Boolean);

    // transcription data (loaded once per test run; set per scenario)
    const transcription = useTranscriptionData();
    await settle();
    transcription.sourceFolios.value = { [source]: new Set(dataFolios) };

    const iiif = useIiifStore();
    if (pages) {
        iiif.links = { [source]: `https://manifest.test/${encodeURIComponent(source)}` };
        if (scenario.manifestLoaded !== false) iiif.parsedData[source] = pages;
    }
    if (scenario.alignment) useSettingsStore().sourceAlignments = { [source]: scenario.alignment };
    if (scenario.defaultAlignment) useSettingsStore().setDefaultAlignments({ [source]: scenario.defaultAlignment });

    const annotations = useAnnotationsStore();
    if (scenario.stored) annotations.hydrate(JSON.parse(JSON.stringify(scenario.stored)));
    if (scenario.importFile) {
        const text = readFileSync(fileURLToPath(new URL(scenario.importFile, fixtures)), 'utf8');
        const dm = useDataManagement();
        const [analysis] = await dm.analyzeImportFiles([{ name: scenario.importFile, text: async () => text }]);
        if (!analysis.success) throw new Error(analysis.error);
        dm.executeImport(analysis.parsed, {});
    }

    const notices = [];
    const result = initPageKeyMigration({ notify: m => notices.push(m) }).runNow();
    await settle();
    return { source, annotations, result, notices };
}

/** What the Manuscripts view shows for one folio. */
function workspaceFor(source, folio) {
    return scope.run(() => useManagerWorkspace(reactive({ source, folio })));
}

describe.each(scenarios.map(s => [s.name, s]))('%s', (name, scenario) => {
    const expected = scenario.expect || {};

    it('shows each folio on the expected scan', async () => {
        if (!expected.canvas && !expected.canvasIndex) return;
        const { source } = await arrange(scenario);
        const { canvasFor } = useImageManifest();
        for (const [folio, label] of Object.entries(expected.canvas || {})) {
            expect(canvasFor(source, folio)?.page.originalFolio ?? null, folio).toBe(label);
        }
        for (const [folio, index] of Object.entries(expected.canvasIndex || {})) {
            expect(canvasFor(source, folio)?.index ?? null, folio).toBe(index);
        }
    });

    it('lists the right lines on each page of the Manuscripts view', async () => {
        if (!expected.lines && !expected.drift && !expected.manualLines) return;
        const { source } = await arrange(scenario);
        for (const [folio, names] of Object.entries(expected.lines || {})) {
            const ws = workspaceFor(source, folio);
            expect(ws.regions.value.map(r => r.name).sort(), folio).toEqual([...names].sort());
        }
        for (const [folio, lines] of Object.entries(expected.manualLines || {})) {
            expect(workspaceFor(source, folio).manualLines.value, folio).toEqual(lines);
        }
        for (const [folio, byName] of Object.entries(expected.drift || {})) {
            const ws = workspaceFor(source, folio);
            const drift = {};
            for (const r of ws.regions.value) if (ws.regionDrift.value[r.id]) drift[r.name] = ws.regionDrift.value[r.id].drawnOn;
            expect(drift, folio).toEqual(byName);
        }
    });

    it('stores the pages under the expected keys, reporting what it leaves alone', async () => {
        if (!expected.keys && expected.kept === undefined) return;
        const { annotations, result, notices } = await arrange(scenario);
        if (expected.keys) expect(Object.keys(annotations.regions).sort()).toEqual([...expected.keys].sort());
        if (expected.kept !== undefined) {
            expect(result.kept.length).toBe(expected.kept);
            if (expected.kept) expect(notices.join(' ')).toMatch(/left as they are/);
        }
        // and running it again changes nothing
        const again = initPageKeyMigration().runNow();
        expect(again.moved).toBe(0);
    });
});
