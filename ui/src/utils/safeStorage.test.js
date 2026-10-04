import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveJSON, storageError } from './safeStorage';

function fakeStorage({ full = false } = {}) {
    const data = {};
    return {
        data,
        setItem: (k, v) => {
            if (full) {
                const e = new Error('quota');
                e.name = 'QuotaExceededError';
                throw e;
            }
            data[k] = v;
        }
    };
}

describe('saveJSON', () => {
    beforeEach(() => {
        storageError.value = null;
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('writes JSON and reports success', () => {
        globalThis.localStorage = fakeStorage();
        expect(saveJSON('k', { a: 1 })).toBe(true);
        expect(globalThis.localStorage.data.k).toBe('{"a":1}');
        expect(storageError.value).toBeNull();
    });

    it('records a quota failure instead of throwing, and clears it on the next good write', () => {
        globalThis.localStorage = fakeStorage({ full: true });
        expect(() => saveJSON('k', { a: 1 })).not.toThrow();
        expect(storageError.value).toMatchObject({ key: 'k' });
        expect(storageError.value.message).toMatch(/full/);

        globalThis.localStorage = fakeStorage();
        saveJSON('other', 1);
        expect(storageError.value).not.toBeNull(); // a different key does not clear it
        saveJSON('k', { a: 1 });
        expect(storageError.value).toBeNull();
    });
});
