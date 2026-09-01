import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import { loadCollections, saveCollections } from '../utils/directSnippetsDb'
import { dataUrlBytes } from '../utils/snippetImages'

/**
 * "Direct snippet" collections: a lightweight path for documenting a notation
 * without IIIF, folios, line regions or polygons. A collection is a named source
 * plus its own patterns (declared by code) and images pasted straight in.
 *
 * State lives in IndexedDB rather than localStorage because the snippets carry
 * base64 image data.
 */
export const useDirectSnippetsStore = defineStore('directSnippets', () => {
    // [{ id, source, name, notes, isPublished, patterns: [{code, label, notes}],
    //    snippets: [{id, pattern, image, caption, refId, variant, width, height, createdAt}] }]
    const collections = ref([])
    const loaded = ref(false)

    async function load() {
        if (loaded.value) return
        const stored = await loadCollections()
        if (stored.length) collections.value = stored
        loaded.value = true
    }

    // Persist after changes settle; image writes are chunky, so avoid a write per keystroke.
    let saveTimer = null
    watch(collections, () => {
        if (!loaded.value) return
        clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
            saveCollections(JSON.parse(JSON.stringify(collections.value)))
        }, 400)
    }, { deep: true })

    /** Immediate write, for use before export or navigation away. */
    async function flush() {
        clearTimeout(saveTimer)
        await saveCollections(JSON.parse(JSON.stringify(collections.value)))
    }

    function getCollection(id) {
        return collections.value.find(c => c.id === id) || null
    }

    function createCollection(source, name = '') {
        const c = {
            id: `dc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            source: source.trim(),
            name: name.trim(),
            notes: '',
            isPublished: false,
            patterns: [],
            snippets: []
        }
        collections.value = [...collections.value, c]
        return c
    }

    function updateCollection(id, patch) {
        collections.value = collections.value.map(c => c.id === id ? { ...c, ...patch } : c)
    }

    function removeCollection(id) {
        collections.value = collections.value.filter(c => c.id !== id)
    }

    // --- Patterns (declared by code, independent of transcription data) ---
    function addPattern(collectionId, code, label = '', notes = '') {
        const c = getCollection(collectionId)
        if (!c) return null
        const clean = (code || '').trim()
        if (!clean) return null
        if (c.patterns.some(p => p.code === clean)) return null
        const p = { code: clean, label: label.trim(), notes: notes.trim() }
        updateCollection(collectionId, { patterns: [...c.patterns, p] })
        return p
    }

    function updatePattern(collectionId, code, patch) {
        const c = getCollection(collectionId)
        if (!c) return
        updateCollection(collectionId, {
            patterns: c.patterns.map(p => p.code === code ? { ...p, ...patch } : p)
        })
    }

    function removePattern(collectionId, code) {
        const c = getCollection(collectionId)
        if (!c) return
        updateCollection(collectionId, {
            patterns: c.patterns.filter(p => p.code !== code),
            // Snippets keep their pattern string; they simply become unassigned.
            snippets: c.snippets.map(s => s.pattern === code ? { ...s, pattern: '' } : s)
        })
    }

    // --- Snippets ---
    function addSnippet(collectionId, { pattern, image, caption = '', refId = '', variant = '', width = 0, height = 0 }) {
        const c = getCollection(collectionId)
        if (!c || !image) return null
        const s = {
            id: `ds_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            pattern: pattern || '',
            image,
            caption: caption.trim(),
            refId: refId.trim(),
            variant: variant.trim(),
            width, height,
            createdAt: new Date().toISOString()
        }
        updateCollection(collectionId, { snippets: [...c.snippets, s] })
        return s
    }

    function updateSnippet(collectionId, snippetId, patch) {
        const c = getCollection(collectionId)
        if (!c) return
        updateCollection(collectionId, {
            snippets: c.snippets.map(s => s.id === snippetId ? { ...s, ...patch } : s)
        })
    }

    function removeSnippet(collectionId, snippetId) {
        const c = getCollection(collectionId)
        if (!c) return
        updateCollection(collectionId, { snippets: c.snippets.filter(s => s.id !== snippetId) })
    }

    const publishedCollections = computed(() => collections.value.filter(c => c.isPublished))

    /** Approximate stored image size, so the UI can warn before it gets silly. */
    function collectionBytes(id) {
        const c = getCollection(id)
        if (!c) return 0
        return c.snippets.reduce((sum, s) => sum + dataUrlBytes(s.image), 0)
    }

    const totalBytes = computed(() =>
        collections.value.reduce((sum, c) =>
            sum + c.snippets.reduce((s2, s) => s2 + dataUrlBytes(s.image), 0), 0)
    )

    /** Replace all state (used by import). */
    function replaceAll(next) {
        collections.value = Array.isArray(next) ? next : []
    }

    /** Merge imported collections, replacing any with a matching id. */
    function mergeCollections(incoming) {
        if (!Array.isArray(incoming)) return
        const byId = new Map(collections.value.map(c => [c.id, c]))
        for (const c of incoming) {
            if (c && c.id) byId.set(c.id, c)
        }
        collections.value = Array.from(byId.values())
    }

    // Start loading as soon as anything touches the store, so an export or the
    // public table never reads an empty list just because nothing called load().
    load()

    return {
        collections, loaded, publishedCollections, totalBytes,
        load, flush,
        getCollection, createCollection, updateCollection, removeCollection,
        addPattern, updatePattern, removePattern,
        addSnippet, updateSnippet, removeSnippet,
        collectionBytes, replaceAll, mergeCollections
    }
})
