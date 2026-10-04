import { describe, it, expect, beforeEach } from 'vitest';
import { nextTick, ref } from 'vue';
import { createPinia, setActivePinia, defineStore } from 'pinia';
import { noteChange, revisionOf, revisionOfAll, untracked, resetTracker } from './changeTracker';

const useDemoStore = defineStore('demo', () => {
    const items = ref({ list: [] });
    return { items };
});

function wired() {
    setActivePinia(createPinia());
    const store = useDemoStore();
    store.$subscribe(() => noteChange('demo'), { detached: true });
    return store;
}

describe('changeTracker', () => {
    beforeEach(() => resetTracker());

    it('counts a deep mutation of a wired store once per flush', async () => {
        const store = wired();
        store.items.list.push({ a: 1 });
        store.items.list.push({ a: 2 });
        await nextTick();
        expect(revisionOf('demo')).toBe(1);
        store.items.list[0].a = 99;
        await nextTick();
        expect(revisionOf('demo')).toBe(2);
    });

    it('does not count changes made inside untracked(), even though the watcher flushes later', async () => {
        const store = wired();
        untracked(() => { store.items.list.push({ loaded: true }); });
        await nextTick();
        await nextTick();
        expect(revisionOf('demo')).toBe(0);
    });

    it('counts edits made after an untracked() block has settled', async () => {
        const store = wired();
        untracked(() => { store.items.list.push({ loaded: true }); });
        await nextTick();
        await nextTick();
        store.items.list.push({ edit: true });
        await nextTick();
        expect(revisionOf('demo')).toBe(1);
    });

    it('supports async functions and releases afterwards', async () => {
        const store = wired();
        await untracked(async () => {
            await Promise.resolve();
            store.items.list.push({ loaded: true });
        });
        await nextTick();
        await nextTick();
        expect(revisionOf('demo')).toBe(0);
        store.items.list.push({ edit: true });
        await nextTick();
        expect(revisionOf('demo')).toBe(1);
    });

    it('releases even when the function throws', async () => {
        expect(() => untracked(() => { throw new Error('boom'); })).toThrow('boom');
        await nextTick();
        noteChange('x');
        expect(revisionOf('x')).toBe(1);
    });

    it('sums revisions across stores', () => {
        noteChange('a');
        noteChange('a');
        noteChange('b');
        expect(revisionOfAll(['a', 'b', 'never'])).toBe(3);
    });
});
