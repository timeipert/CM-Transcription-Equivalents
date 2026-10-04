import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effectScope } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../../utils/directSnippetsDb', () => ({
    loadCollections: async () => [],
    saveCollections: async () => true
}));

import { createWorkspaceStorage } from './workspaceStorage';
import { initPersistence, flushLocalSaves } from './storeRegistry';
import { resetTracker } from './changeTracker';
import { SCHEMA_VERSION, workspaceFile } from './workspaceSchema';
import { createFakeFolder, createFakeStorage } from '../../test/fakes';

const box = (x, y) => `${x},${y} ${x + 4},${y} ${x + 4},${y + 4} ${x},${y + 4}`;
const DEBOUNCE = 50;

let stores;
let local; // the page's localStorage
let syncStore; // where the service remembers what the file looked like
let handles; // the IndexedDB handle store
let services;

/** Let timers, the Vue scheduler and the fake file system's promises all run. */
async function flush(ms = 0) {
    await vi.advanceTimersByTimeAsync(ms);
    for (let i = 0; i < 40; i++) await Promise.resolve();
}

function boot() {
    local = createFakeStorage();
    globalThis.localStorage = local;
    const pinia = createPinia();
    setActivePinia(pinia);
    stores = initPersistence(pinia, { storage: local });
}

/** A service wired to the fakes. Several can be made to simulate page reloads. */
function service(extra = {}) {
    const svc = createWorkspaceStorage({
        getStores: () => stores,
        getHandle: async key => handles[key],
        setHandle: async (key, value) => { handles[key] = value; },
        pickDirectory: async () => { throw new Error('no picker in this test'); },
        storage: syncStore,
        session: createFakeStorage(),
        isSupported: true,
        debounceMs: DEBOUNCE,
        ...extra
    });
    services.push(svc);
    return svc;
}

/** A current-format workspace file with a little content. */
function savedWorkspace(overrides = {}) {
    return JSON.stringify(workspaceFile({
        label: 'From file',
        data: {
            personalTables: [{ id: 't1', name: 'Pa 1', source: 'Pa 1', rows: [{ pattern: '*', customId: '1' }], patterns: ['*'] }],
            regions: { 'Pa 1_1r': [{ id: 'r1', name: 'Line 1', points: '0,0 100,0 100,10 0,10' }] },
            regionItems: { r1: [{ id: 'i1', pattern: '*', points: box(5, 2) }] },
            settings: { snippetSize: 99 },
            ...overrides
        }
    }));
}

beforeEach(async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    resetTracker();
    syncStore = createFakeStorage();
    handles = {};
    services = [];
    boot();
    await flush(); // let the direct snippet store finish "loading"
});

afterEach(() => {
    services.forEach(s => s.dispose());
    flushLocalSaves();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('binding an empty folder', () => {
    it('seeds it with the app\'s current state', async () => {
        stores.annotations.addRegion('S', '1r', 'Line 1', box(0, 0));
        stores.settings.snippetSize = 77;
        await flush();

        const folder = createFakeFolder();
        const svc = service();
        await svc.attachFolder(folder);

        expect(svc.folderName.value).toBe('workspace');
        expect(svc.status.value).toBe('saved');
        const file = folder.readJson('workspace.json');
        expect(file.schemaVersion).toBe(SCHEMA_VERSION);
        expect(Object.keys(file.data.regions)).toEqual(['S_1r']);
        expect(file.data.settings.snippetSize).toBe(77);
        expect(file.data.directSnippets).toBeUndefined();
        expect(folder.readJson('direct-snippets.json').collections).toEqual([]);
        expect(handles.workspaceDirHandle).toBe(folder);
    });

    it('stores the handle so the next page load finds the folder again', async () => {
        const svc = service();
        await svc.attachFolder(createFakeFolder());
        expect(handles.workspaceDirHandle).toBeTruthy();
    });

    it('keeps the handle and the sync record under its own prefix, so another build on the same origin keeps its own folder', async () => {
        const svc = service({ keyPrefix: 'next:' });
        await svc.attachFolder(createFakeFolder());
        expect(handles['next:workspaceDirHandle']).toBeTruthy();
        expect(handles.workspaceDirHandle).toBeUndefined();
        expect(syncStore.getItem('next:workspaceSync_v1')).not.toBeNull();
        expect(syncStore.getItem('workspaceSync_v1')).toBeNull();
    });
});

describe('autosave', () => {
    it('writes after the debounce, and only the file that changed', async () => {
        const folder = createFakeFolder();
        const svc = service();
        await svc.attachFolder(folder);
        folder.writes.length = 0;

        stores.annotations.addRegion('S', '1r', 'Line 1', box(0, 0));
        await flush(DEBOUNCE - 10);
        expect(folder.writes).toEqual([]);
        await flush(20);
        expect(folder.writes).toEqual(['workspace.json']);
        expect(Object.keys(folder.readJson('workspace.json').data.regions)).toEqual(['S_1r']);
        expect(svc.status.value).toBe('saved');
    });

    it('writes the direct snippets file only when they change', async () => {
        const folder = createFakeFolder();
        const svc = service();
        await svc.attachFolder(folder);
        folder.writes.length = 0;

        await stores.direct.hydrate([{ id: 'dc_1', source: 'S', snippets: [], patterns: [] }]);
        stores.direct.updateCollection('dc_1', { name: 'Neumes' });
        await flush(DEBOUNCE + 10);
        expect(folder.writes).toEqual(['direct-snippets.json']);
        expect(folder.readJson('direct-snippets.json').collections[0].name).toBe('Neumes');
    });

    it('merges a burst of edits into one write', async () => {
        const folder = createFakeFolder();
        const svc = service();
        await svc.attachFolder(folder);
        folder.writes.length = 0;

        for (let i = 0; i < 5; i++) {
            stores.settings.snippetSize = 60 + i;
            await flush(10);
        }
        await flush(DEBOUNCE + 10);
        expect(folder.writes).toEqual(['workspace.json']);
        expect(folder.readJson('workspace.json').data.settings.snippetSize).toBe(64);
    });

    it('never runs two writes at once, and does not lose an edit made mid-write', async () => {
        const folder = createFakeFolder();
        const svc = service();
        await svc.attachFolder(folder);

        stores.settings.snippetSize = 71;
        await flush();
        const first = svc.saveWorkspace();
        stores.settings.snippetSize = 72;
        await flush();
        const second = svc.saveWorkspace();
        await Promise.all([first, second]);
        await flush(DEBOUNCE + 10);

        expect(folder.maxConcurrentWrites).toBe(1);
        expect(folder.readJson('workspace.json').data.settings.snippetSize).toBe(72);
    });

    it('keeps saving after the component that first used it is gone', async () => {
        // The service is created lazily by whichever component asks first; that
        // component unmounting (stopping its effect scope) must not stop autosave.
        const componentScope = effectScope();
        const folder = createFakeFolder();
        const svc = componentScope.run(() => service());
        await svc.attachFolder(folder);
        componentScope.stop();
        folder.writes.length = 0;

        stores.settings.snippetSize = 88;
        await flush(DEBOUNCE + 10);
        expect(folder.writes).toEqual(['workspace.json']);
        expect(folder.readJson('workspace.json').data.settings.snippetSize).toBe(88);
    });

    it('does nothing before a folder is bound', async () => {
        service();
        stores.settings.snippetSize = 70;
        await flush(DEBOUNCE * 3);
        // no throw, nothing to assert on a folder: just that the page still works
        expect(stores.settings.snippetSize).toBe(70);
    });

    it('does not write the direct snippets before they have loaded', async () => {
        const folder = createFakeFolder();
        const svc = service();
        stores.direct.loaded = false;
        await svc.attachFolder(folder);
        expect(folder.has('direct-snippets.json')).toBe(false);
        expect(folder.has('workspace.json')).toBe(true);
        stores.direct.loaded = true;
    });
});

describe('binding a folder that already has a workspace', () => {
    it('loads it (the file wins) and does not write', async () => {
        const folder = createFakeFolder('ws', { 'workspace.json': savedWorkspace() });
        const svc = service();
        await svc.attachFolder(folder);

        expect(stores.settings.snippetSize).toBe(99);
        expect(stores.tables.tables.map(t => t.id)).toEqual(['t1']);
        expect(stores.annotations.getAnnotations('Pa 1', '1r', '*')).toHaveLength(1);
        expect(folder.writes).toEqual([]);
        expect(svc.status.value).toBe('saved');
    });

    it('does not mistake the load for edits', async () => {
        const folder = createFakeFolder('ws', { 'workspace.json': savedWorkspace() });
        const svc = service();
        await svc.attachFolder(folder);
        await flush(DEBOUNCE * 4);
        expect(folder.writes).toEqual([]);
    });

    it('saves the work it displaces into the folder first', async () => {
        stores.annotations.addRegion('Mine', '1r', 'Line 1', box(0, 0));
        await flush();
        const folder = createFakeFolder('ws', { 'workspace.json': savedWorkspace() });
        const svc = service();
        await svc.attachFolder(folder);

        const kept = folder.names().find(n => n.startsWith('workspace.replaced-'));
        expect(kept).toBeTruthy();
        expect(Object.keys(folder.readJson(kept).data.regions)).toEqual(['Mine_1r']);
        expect(svc.notice.value).toContain(kept);
        expect(stores.annotations.getRegions('Mine', '1r')).toEqual([]);
    });

    it('does not write a replaced-work file when the app had nothing', async () => {
        const folder = createFakeFolder('ws', { 'workspace.json': savedWorkspace() });
        await service().attachFolder(folder);
        expect(folder.names().some(n => n.startsWith('workspace.replaced-'))).toBe(false);
    });

    it('reads the direct snippets from their own file', async () => {
        const folder = createFakeFolder('ws', {
            'workspace.json': savedWorkspace(),
            'direct-snippets.json': JSON.stringify({ schemaVersion: SCHEMA_VERSION, collections: [{ id: 'dc_9', source: 'S', snippets: [], patterns: [] }] })
        });
        await service().attachFolder(folder);
        expect(stores.direct.serialize().map(c => c.id)).toEqual(['dc_9']);
    });
});

describe('a file that cannot be used is never overwritten', () => {
    it('corrupt workspace.json: refuses the folder and leaves the file as it was', async () => {
        const folder = createFakeFolder('ws', { 'workspace.json': '{"schemaVersion": 2, "data": {' });
        const svc = service();
        await svc.attachFolder(folder);

        expect(svc.status.value).toBe('error');
        expect(svc.lastError.value).toMatch(/not valid JSON/);
        expect(svc.folderName.value).toBe('');
        expect(folder.read('workspace.json')).toBe('{"schemaVersion": 2, "data": {');
        expect(folder.writes).toEqual([]);

        stores.settings.snippetSize = 70;
        await flush(DEBOUNCE * 3);
        expect(folder.writes).toEqual([]);
    });

    it('a file written by a newer app is refused, with the reason', async () => {
        const text = JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, data: { regions: {} } });
        const folder = createFakeFolder('ws', { 'workspace.json': text });
        const svc = service();
        await svc.attachFolder(folder);

        expect(svc.lastError.value).toMatch(/newer version/);
        expect(folder.read('workspace.json')).toBe(text);
        expect(folder.writes).toEqual([]);
    });

    describe('meeting a folder another version of the app bound (no sync record yet)', () => {
        const localWork = () => {
            stores.annotations.regions = { 'Other_1r': [{ id: 'mine', name: 'Line 1', points: box(0, 0) }] };
            stores.annotations.regionItems = { mine: [{ id: 'mine-i', pattern: '*u', points: box(1, 1) }] };
        };

        it('keeps work that is only in the app aside before loading the folder, and says so', async () => {
            localWork();
            const folder = createFakeFolder('ws', { 'workspace.json': savedWorkspace() });
            handles.workspaceDirHandle = folder;
            const svc = service();
            await svc.initPromise;
            await flush(DEBOUNCE * 3);

            // the folder's workspace is what is loaded
            expect(Object.keys(stores.annotations.regions)).toEqual(['Pa 1_1r']);
            // and what the app held is not lost
            const kept = folder.names().find(n => n.startsWith('workspace.replaced-'));
            expect(kept).toBeTruthy();
            expect(Object.keys(folder.readJson(kept).data.regions)).toEqual(['Other_1r']);
            expect(svc.notice.value).toContain(kept);
        });

        it('writes nothing extra when the app already holds exactly what the folder has', async () => {
            const folder = createFakeFolder('ws', { 'workspace.json': savedWorkspace() });
            handles.workspaceDirHandle = folder;
            await service().initPromise;           // first meeting loads the file into the app
            await flush(DEBOUNCE * 3);

            syncStore.removeItem('workspaceSync_v1'); // a "new" build meets the same folder again
            const again = service();
            await again.initPromise;
            await flush(DEBOUNCE * 3);
            expect(folder.names().filter(n => n.startsWith('workspace.replaced-'))).toEqual([]);
        });

        it('does not keep a copy when the app has no work of its own', async () => {
            const folder = createFakeFolder('ws', { 'workspace.json': savedWorkspace() });
            handles.workspaceDirHandle = folder;
            await service().initPromise;
            expect(folder.names().filter(n => n.startsWith('workspace.replaced-'))).toEqual([]);
        });

        it('a folder this build already syncs with is not second-guessed on later startups', async () => {
            const folder = createFakeFolder('ws', { 'workspace.json': savedWorkspace() });
            handles.workspaceDirHandle = folder;
            await service().initPromise;
            await flush(DEBOUNCE * 3);

            localWork();                              // more work, then a reload (sync record kept)
            await flush(DEBOUNCE * 3);
            const again = service();
            await again.initPromise;
            expect(folder.names().filter(n => n.startsWith('workspace.replaced-'))).toEqual([]);
        });
    });

    it('JSON that is not a workspace is refused', async () => {
        const folder = createFakeFolder('ws', { 'workspace.json': '{"hello": "world"}' });
        const svc = service();
        await svc.attachFolder(folder);
        expect(svc.status.value).toBe('error');
        expect(folder.read('workspace.json')).toBe('{"hello": "world"}');
    });

    it('a corrupt direct snippets file is refused too', async () => {
        const folder = createFakeFolder('ws', { 'workspace.json': savedWorkspace(), 'direct-snippets.json': 'oops' });
        const svc = service();
        await svc.attachFolder(folder);
        expect(svc.lastError.value).toMatch(/direct-snippets\.json/);
        expect(folder.read('direct-snippets.json')).toBe('oops');
    });

    it('on startup, a stored folder whose file went bad goes read-only and stays untouched', async () => {
        const folder = createFakeFolder('ws', { 'workspace.json': 'garbage' });
        handles.workspaceDirHandle = folder;
        const svc = service();
        await svc.initPromise;

        expect(svc.readOnly.value).toBe(true);
        expect(svc.status.value).toBe('error');
        expect(svc.folderName.value).toBe('ws');

        stores.settings.snippetSize = 70;
        await flush(DEBOUNCE * 3);
        await svc.saveWorkspace();
        expect(folder.read('workspace.json')).toBe('garbage');
        expect(folder.writes).toEqual([]);
    });

    it('rejecting a folder does not disturb the folder that already works', async () => {
        const good = createFakeFolder('good');
        const svc = service();
        await svc.attachFolder(good);
        const bad = createFakeFolder('bad', { 'workspace.json': 'nope' });
        await svc.attachFolder(bad);

        expect(svc.folderName.value).toBe('good');
        expect(svc.readOnly.value).toBe(false);
        expect(bad.read('workspace.json')).toBe('nope');
        stores.settings.snippetSize = 73;
        await flush(DEBOUNCE + 10);
        expect(good.readJson('workspace.json').data.settings.snippetSize).toBe(73);
    });
});

describe('a file in an older format', () => {
    const v1 = () => JSON.stringify({
        schemaVersion: 1,
        savedAt: '2026-01-01T00:00:00.000Z',
        label: 'Old',
        data: {
            personalTables: [],
            annotations: { 'Pa 1_1r_*dd': [{ id: 'a1', points: box(10, 5) }] },
            regions: { 'Pa 1_1r': [{ id: 'r1', name: 'Line 1', points: '0,0 100,0 100,20 0,20' }] },
            regionItems: { r1: [] },
            manualLines: {},
            iiifLinks: {},
            settings: { snippetSize: 55 },
            directSnippets: [{ id: 'dc_old', source: 'S', snippets: [], patterns: [] }]
        }
    });

    it('is upgraded in memory, kept as a pre-upgrade copy, then rewritten in the new layout', async () => {
        const original = v1();
        const folder = createFakeFolder('ws', { 'workspace.json': original });
        const svc = service();
        await svc.attachFolder(folder);

        expect(stores.annotations.getAnnotations('Pa 1', '1r', '*dd')).toHaveLength(1);
        expect(stores.settings.snippetSize).toBe(55);
        expect(folder.read('workspace.pre-v1.json')).toBe(original);
        expect(svc.notice.value).toMatch(/Upgraded old whole-page annotations/);

        await flush(10);
        const file = folder.readJson('workspace.json');
        expect(file.schemaVersion).toBe(SCHEMA_VERSION);
        expect(file.data.annotations).toBeUndefined();
        expect(file.data.directSnippets).toBeUndefined();
        expect(folder.readJson('direct-snippets.json').collections.map(c => c.id)).toEqual(['dc_old']);
    });

    it('does not overwrite an existing pre-upgrade copy', async () => {
        const folder = createFakeFolder('ws', { 'workspace.json': v1(), 'workspace.pre-v1.json': 'the first backup' });
        await service().attachFolder(folder);
        expect(folder.read('workspace.pre-v1.json')).toBe('the first backup');
    });
});

describe('a file changed by someone else', () => {
    it('is kept as a backup before it is replaced', async () => {
        const folder = createFakeFolder();
        const svc = service();
        await svc.attachFolder(folder);

        const theirs = savedWorkspace({ settings: { snippetSize: 120 } });
        folder.put('workspace.json', theirs);

        stores.settings.snippetSize = 81;
        await flush(DEBOUNCE + 10);

        expect(folder.read('workspace.backup-external.json')).toBe(theirs);
        expect(folder.readJson('workspace.json').data.settings.snippetSize).toBe(81);
        expect(svc.notice.value).toContain('workspace.backup-external.json');
    });

    it('is not overwritten at all if it is unreadable', async () => {
        const folder = createFakeFolder();
        const svc = service();
        await svc.attachFolder(folder);

        folder.put('workspace.json', 'someone saved garbage here');
        stores.settings.snippetSize = 81;
        await flush(DEBOUNCE + 10);

        expect(folder.read('workspace.json')).toBe('someone saved garbage here');
        expect(svc.readOnly.value).toBe(true);
        expect(svc.status.value).toBe('error');
    });

    it('is not overwritten if a newer app wrote it', async () => {
        const folder = createFakeFolder();
        const svc = service();
        await svc.attachFolder(folder);

        const newer = JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, data: {} });
        folder.put('workspace.json', newer);
        stores.settings.snippetSize = 81;
        await flush(DEBOUNCE + 10);

        expect(folder.read('workspace.json')).toBe(newer);
        expect(svc.readOnly.value).toBe(true);
    });

    it('our own writes never look like outside changes', async () => {
        const folder = createFakeFolder();
        const svc = service();
        await svc.attachFolder(folder);
        for (let i = 0; i < 3; i++) {
            stores.settings.snippetSize = 70 + i;
            await flush(DEBOUNCE + 10);
        }
        expect(folder.has('workspace.backup-external.json')).toBe(false);
    });
});

describe('coming back (page reload)', () => {
    async function firstSession() {
        const folder = createFakeFolder();
        const svc = service();
        await svc.attachFolder(folder);
        stores.annotations.addRegion('S', '1r', 'Line 1', box(0, 0));
        await flush(DEBOUNCE + 10);
        flushLocalSaves();
        svc.dispose();
        return folder;
    }

    /** What a reload does: a fresh page whose localStorage keeps its contents. */
    function reload() {
        const kept = Object.fromEntries(local.keys().map(k => [k, local.getItem(k)]));
        resetTracker();
        local = createFakeStorage(kept);
        globalThis.localStorage = local;
        const pinia = createPinia();
        setActivePinia(pinia);
        stores = initPersistence(pinia, { storage: local });
    }

    it('finds the folder, sees the file unchanged, and writes nothing', async () => {
        const folder = await firstSession();
        folder.writes.length = 0;
        reload();
        const svc = service();
        await svc.initPromise;

        expect(svc.folderName.value).toBe('workspace');
        expect(svc.status.value).toBe('saved');
        expect(stores.annotations.getRegions('S', '1r')).toHaveLength(1);
        await flush(DEBOUNCE * 3);
        expect(folder.writes).toEqual([]);
    });

    it('loads a file that was changed elsewhere while the app was closed (nothing unsaved here)', async () => {
        const folder = await firstSession();
        folder.put('workspace.json', savedWorkspace({ settings: { snippetSize: 111 } }));
        reload();
        const svc = service();
        await svc.initPromise;

        expect(stores.settings.snippetSize).toBe(111);
        expect(stores.annotations.getRegions('Pa 1', '1r')).toHaveLength(1);
        expect(folder.has('workspace.backup-external.json')).toBe(false);
    });

    it('keeps the other version aside when both sides changed, and carries on with the local work', async () => {
        const folder = await firstSession();
        // an edit that never reached the file: the page was closed inside the debounce
        const svc1 = service();
        await svc1.attachFolder(folder);
        stores.settings.snippetSize = 66;
        await flush(); // marks the sync record dirty, save still pending
        flushLocalSaves();
        svc1.dispose();
        const theirs = savedWorkspace({ settings: { snippetSize: 111 } });
        folder.put('workspace.json', theirs);

        reload();
        const svc = service();
        await svc.initPromise;

        expect(folder.read('workspace.backup-external.json')).toBe(theirs);
        expect(stores.settings.snippetSize).toBe(66);
        expect(folder.readJson('workspace.json').data.settings.snippetSize).toBe(66);
    });

    it('pushes edits that never reached an unchanged file', async () => {
        const folder = await firstSession();
        const svc1 = service();
        await svc1.attachFolder(folder);
        stores.settings.snippetSize = 67;
        await flush();
        flushLocalSaves();
        svc1.dispose();

        reload();
        const svc = service();
        await svc.initPromise;
        expect(folder.readJson('workspace.json').data.settings.snippetSize).toBe(67);
    });

    it('without permission, says so and still lets the page run on browser storage', async () => {
        const folder = await firstSession();
        folder.permission = 'prompt';
        reload();
        const svc = service();
        await svc.initPromise;

        expect(svc.status.value).toBe('error');
        expect(svc.lastError.value).toMatch(/Permission needed/);
        expect(stores.annotations.getRegions('S', '1r')).toHaveLength(1);
    });

    it('re-granting permission syncs instead of overwriting', async () => {
        const folder = await firstSession();
        folder.permission = 'prompt';
        reload();
        const svc = service();
        await svc.initPromise;

        // someone else changed the file while we had no access, and nothing was edited here
        folder.put('workspace.json', savedWorkspace({ settings: { snippetSize: 140 } }));
        await svc.reGrantPermission();

        expect(svc.status.value).toBe('saved');
        expect(stores.settings.snippetSize).toBe(140);
        expect(folder.readJson('workspace.json').data.settings.snippetSize).toBe(140);
    });

    it('edits made while permission was missing are written after re-granting', async () => {
        const folder = await firstSession();
        reload();
        const svc2 = service();
        await svc2.initPromise;
        // permission is lost mid-session
        folder.permission = 'prompt';
        stores.settings.snippetSize = 90;
        await flush(DEBOUNCE + 10);
        expect(svc2.status.value).toBe('error');
        expect(svc2.lastError.value).toMatch(/Permission lost/);

        await svc2.reGrantPermission();
        expect(svc2.status.value).toBe('saved');
        expect(folder.readJson('workspace.json').data.settings.snippetSize).toBe(90);
    });
});

describe('choosing a folder', () => {
    it('a cancelled picker is not an error', async () => {
        const svc = service({ pickDirectory: async () => { throw Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' }); } });
        await svc.chooseFolder();
        expect(svc.status.value).toBe('idle');
        expect(svc.lastError.value).toBeNull();
    });

    it('binds the folder the picker returns', async () => {
        const folder = createFakeFolder('picked');
        const svc = service({ pickDirectory: async () => folder });
        await svc.chooseFolder();
        expect(svc.folderName.value).toBe('picked');
        expect(folder.has('workspace.json')).toBe(true);
    });

    it('reports a denied permission', async () => {
        const folder = createFakeFolder('picked');
        folder.permission = 'denied';
        folder.requestPermission = async () => 'denied';
        const svc = service({ pickDirectory: async () => folder });
        await svc.chooseFolder();
        expect(svc.status.value).toBe('error');
        expect(svc.lastError.value).toMatch(/denied/);
        expect(svc.folderName.value).toBe('');
    });

    it('explains itself where the browser has no folder access', async () => {
        const svc = service({ isSupported: false });
        await svc.chooseFolder();
        expect(svc.lastError.value).toMatch(/not supported/);
        await svc.initPromise;
    });

    it('continuing without a folder is remembered for the session', () => {
        const session = createFakeStorage();
        const svc = service({ session });
        expect(svc.isStorageBypassed.value).toBe(false);
        svc.bypassStorage();
        expect(svc.isStorageBypassed.value).toBe(true);
        expect(session.getItem('workspace_bypassed')).toBe('true');
        expect(service({ session }).isStorageBypassed.value).toBe(true);
    });
});

describe('the round trip', () => {
    it('everything saved to the folder comes back into a fresh app', async () => {
        stores.annotations.addRegion('S', '1r', 'Line 1', box(0, 0));
        stores.tables.createTable('S');
        stores.settings.hydrate({ snippetVariants: [{ key: 'x', label: 'Ex' }], snippetSize: 77 });
        stores.library.updateEntry('*dd', { label: 'clivis' });
        stores.ommrSettings.setFolioOffset('S', 3);
        await stores.direct.hydrate([{ id: 'dc_1', source: 'S', snippets: [{ id: 's1', image: 'data:image/png;base64,AAAA' }], patterns: [] }]);
        await flush();

        const folder = createFakeFolder();
        await service().attachFolder(folder);
        const before = {
            core: JSON.parse(JSON.stringify(stores.annotations.serialize())),
            settings: JSON.parse(JSON.stringify(stores.settings.serialize())),
            library: JSON.parse(JSON.stringify(stores.library.serialize())),
            ommr: JSON.parse(JSON.stringify(stores.ommrSettings.serialize())),
            tables: JSON.parse(JSON.stringify(stores.tables.tables)),
            direct: JSON.parse(JSON.stringify(stores.direct.serialize()))
        };

        // a different browser: empty storage, same folder
        services.forEach(s => s.dispose());
        resetTracker();
        syncStore = createFakeStorage();
        boot();
        await flush();
        const fresh = service();
        await fresh.attachFolder(folder);

        expect(JSON.parse(JSON.stringify(stores.annotations.serialize()))).toEqual(before.core);
        expect(JSON.parse(JSON.stringify(stores.settings.serialize()))).toEqual(before.settings);
        expect(JSON.parse(JSON.stringify(stores.library.serialize()))).toEqual(before.library);
        expect(JSON.parse(JSON.stringify(stores.ommrSettings.serialize()))).toEqual(before.ommr);
        expect(JSON.parse(JSON.stringify(stores.tables.tables))).toEqual(before.tables);
        expect(JSON.parse(JSON.stringify(stores.direct.serialize()))).toEqual(before.direct);
    });
});
