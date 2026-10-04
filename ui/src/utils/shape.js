/**
 * Small shape checks shared by the stores' `hydrate()` functions and the
 * workspace schema. Data coming from localStorage, a workspace file or an import
 * is untrusted: a value of the wrong container type (an array where an object is
 * expected) would otherwise be assigned straight into a store and crash a view
 * far from the cause.
 */

export const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A deep copy of plain JSON data (also works on Vue reactive proxies). */
export function cloneJson(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** The value if it is a plain object, otherwise a fresh empty one. */
export function asObject(value) {
    return isPlainObject(value) ? value : {};
}

/** The value if it is an array, otherwise a fresh empty one. */
export function asArray(value) {
    return Array.isArray(value) ? value : [];
}
