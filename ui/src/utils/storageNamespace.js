/**
 * A prefix for this build's browser-storage keys.
 *
 * Two builds of the app can be served from the same origin (the previous version
 * at the site root, the current one under /next/). Browser storage is shared by
 * origin, so without a prefix they would read and overwrite each other's data in
 * different shapes. A build made with `VITE_STORAGE_NS=next:` keeps its own keys.
 * On its first visit it starts from a copy of what the other build had stored
 * (see the `legacy` readers in services/persistence/storeRegistry.js) and the two
 * are independent from then on. Empty (the default) means the unprefixed keys.
 */
// Vite replaces the literal text `import.meta.env.VITE_…` at build time, so it must be
// written exactly like this (no alias, no cast). The DOM typings do not know `env`.
// @ts-ignore
export const STORAGE_NS = import.meta.env?.VITE_STORAGE_NS || '';
