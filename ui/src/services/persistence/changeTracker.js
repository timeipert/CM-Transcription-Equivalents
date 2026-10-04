/**
 * One change signal for every persisted store.
 *
 * Three things used to watch the same data with their own deep watcher — the
 * localStorage mirror, the workspace-folder autosave and the backup reminder —
 * so every annotation edit walked the whole tree three times, and hydrating a
 * store had to silence the autosave with a `setTimeout(…, 100)`.
 *
 * Now each persisted store gets exactly one watcher (wired by the registry).
 * Whenever it fires, it bumps a per-store revision counter here, and everything
 * else watches those cheap numbers instead of the data. Loading state from disk
 * runs inside `untracked()`, which makes the bumps invisible without any timers.
 */

import { reactive, nextTick } from 'vue';

const revisions = reactive({});
let suspended = 0;

/** Record that a store changed. Ignored while inside `untracked()`. */
export function noteChange(storeId) {
    if (suspended > 0) return;
    revisions[storeId] = (revisions[storeId] || 0) + 1;
}

/** Current revision of one store (0 until it first changes). Reactive. */
export function revisionOf(storeId) {
    return revisions[storeId] || 0;
}

/** Sum of the revisions of several stores. Reactive. */
export function revisionOfAll(storeIds) {
    let sum = 0;
    for (const id of storeIds) sum += revisions[id] || 0;
    return sum;
}

/**
 * Run `fn` without counting the changes it makes — for loading state from
 * localStorage, a workspace file or an import, none of which are user edits.
 *
 * The store watchers flush asynchronously, so the suspension is released on the
 * next tick, after the flush has happened. Supports async functions.
 */
export function untracked(fn) {
    suspended++;
    const release = () => { nextTick(() => { suspended--; }); };
    try {
        const out = fn();
        if (out && typeof out.then === 'function') return out.finally(release);
        release();
        return out;
    } catch (e) {
        release();
        throw e;
    }
}

/** Forget every revision. For tests. */
export function resetTracker() {
    for (const key of Object.keys(revisions)) delete revisions[key];
    suspended = 0;
}
