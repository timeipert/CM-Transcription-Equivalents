/**
 * Collision-free ids for new records. `Date.now()` alone repeats within the same
 * millisecond (bulk actions, imports), and two records sharing an id are then
 * removed together. Existing ids are left untouched — numbers stay numbers.
 */
export function newId(prefix = '') {
    const rand = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return prefix ? `${prefix}_${rand}` : rand;
}
