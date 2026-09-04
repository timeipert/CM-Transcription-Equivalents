<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDirectSnippetsStore } from '../stores/directSnippets';
import { useSettingsStore } from '../stores/settings';
import { useTranscriptionData } from '../composables/useTranscriptionData';
import PatternDisplay from '../components/PatternDisplay.vue';
import PatternCode from '../components/PatternCode.vue';

/**
 * Public page for a manuscript documented without IIIF.
 *
 * It deliberately mirrors the IIIF notation page's structure — a pattern table
 * followed by the images — but its snippets are stored images rather than live
 * IIIF crops, and there are no folios, line regions or polygons to show.
 */

const route = useRoute();
const router = useRouter();
const directStore = useDirectSnippetsStore();
const settings = useSettingsStore();
const { glyphs } = useTranscriptionData();

const sourceParam = computed(() => decodeURIComponent(route.params.source));

onMounted(() => directStore.load());

const collection = computed(() =>
    directStore.publishedCollections.find(c => c.source === sourceParam.value) || null
);

const metaFields = computed(() => settings.sourceMetaFields || []);
const metaValues = computed(() => {
    if (!collection.value) return [];
    return metaFields.value
        .map(f => ({ label: f.label, value: settings.getSourceMetaValue(collection.value.source, f.key) }))
        .filter(x => x.value);
});

/** Patterns that actually carry snippets, plus any declared but still empty. */
const rows = computed(() => {
    if (!collection.value) return [];
    const byPattern = {};
    for (const p of collection.value.patterns) byPattern[p.code] = { pattern: p, snippets: [] };
    const unassigned = [];
    for (const s of collection.value.snippets) {
        if (s.pattern && byPattern[s.pattern]) byPattern[s.pattern].snippets.push(s);
        else unassigned.push(s);
    }
    const out = Object.values(byPattern);
    if (unassigned.length) {
        out.push({ pattern: { code: '', label: 'Unassigned' }, snippets: unassigned });
    }
    return out;
});

const totalSnippets = computed(() => collection.value?.snippets.length || 0);

// Magnifier
const zoomed = ref(null);
function openZoom(snip, patternCode) {
    zoomed.value = { ...snip, patternCode };
}
function closeZoom() { zoomed.value = null; }
</script>

<template>
<div class="public-custom">
    <header class="header">
        <div class="top-nav-bar">
            <button class="nav-tab" @click="router.push('/public')">&larr; Manuscript Directory</button>
            <button class="nav-tab" @click="router.push('/public/table')">Neumentabelle (Comparison) &rarr;</button>
        </div>

        <div v-if="collection" class="header-content">
            <div class="eyebrow">
                Notation documentation
                <span class="direct-badge" title="Documented from directly added images, not IIIF">own images</span>
            </div>
            <h1>{{ collection.source }}</h1>
            <p v-if="collection.name" class="subtitle">{{ collection.name }}</p>
            <p v-if="collection.notes" class="notes">{{ collection.notes }}</p>

            <dl v-if="metaValues.length" class="meta-list">
                <div v-for="m in metaValues" :key="m.label" class="meta-item">
                    <dt>{{ m.label }}</dt>
                    <dd>{{ m.value }}</dd>
                </div>
            </dl>

            <div class="counts">
                <span class="badge">{{ collection.patterns.length }} patterns</span>
                <span class="badge">{{ totalSnippets }} snippets</span>
            </div>
        </div>
    </header>

    <main class="content">
        <div v-if="!collection" class="empty-state">
            <div class="icon">📄</div>
            <h3>Not found</h3>
            <p>No published custom manuscript named “{{ sourceParam }}”.</p>
            <button class="btn-view" @click="router.push('/public')">Back to directory</button>
        </div>

        <template v-else>
            <section v-for="row in rows" :key="row.pattern.code || '_unassigned'" class="pattern-section">
                <div class="pattern-head">
                    <div class="pattern-id">
                        <PatternDisplay v-if="row.pattern.code" :pattern="row.pattern.code" :glyphs="glyphs" />
                        <PatternCode v-if="row.pattern.code" :pattern="row.pattern.code" />
                    </div>
                    <div class="pattern-meta">
                        <h2>{{ row.pattern.label || row.pattern.code || 'Unassigned' }}</h2>
                        <span class="count">{{ row.snippets.length }} snippet{{ row.snippets.length === 1 ? '' : 's' }}</span>
                    </div>
                </div>

                <div v-if="row.snippets.length" class="snippet-row">
                    <figure v-for="s in row.snippets" :key="s.id" class="snippet"
                            @click="openZoom(s, row.pattern.code)" title="Click to enlarge">
                        <img :src="s.image" :alt="s.caption || row.pattern.code" />
                        <figcaption>
                            <span v-if="s.refId" class="ref">{{ s.refId }}</span>
                            <span class="cap">{{ s.caption }}</span>
                        </figcaption>
                    </figure>
                </div>
                <div v-else class="no-snippets">No images for this pattern yet.</div>
            </section>
        </template>
    </main>

    <!-- Magnifier -->
    <Transition name="fade">
        <div v-if="zoomed" class="zoom-overlay" @click.self="closeZoom">
            <div class="zoom-content">
                <button class="close-btn" @click="closeZoom">&times;</button>
                <div class="zoom-header">
                    <span v-if="zoomed.refId" class="ref-pill">{{ zoomed.refId }}</span>
                    <PatternDisplay v-if="zoomed.patternCode" :pattern="zoomed.patternCode" :glyphs="glyphs" />
                    <PatternCode v-if="zoomed.patternCode" :pattern="zoomed.patternCode" />
                </div>
                <img class="zoom-img" :src="zoomed.image" :alt="zoomed.caption || ''" />
                <div class="zoom-footer">
                    <strong>{{ collection.source }}</strong>
                    <span v-if="zoomed.caption"> &bull; {{ zoomed.caption }}</span>
                </div>
            </div>
        </div>
    </Transition>
</div>
</template>

<style scoped>
.public-custom { min-height: 100vh; background: var(--color-bg); }

.header { background: white; border-bottom: 1px solid var(--color-border); padding: 20px 32px 28px; }
.top-nav-bar { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
.nav-tab { background: none; border: 1px solid var(--color-border); border-radius: 999px; padding: 6px 14px; font-size: 13px; cursor: pointer; color: var(--color-text-muted); font-weight: 600; }
.nav-tab:hover { background: var(--color-bg); color: var(--color-text); }

.header-content { max-width: 1100px; margin: 0 auto; }
.eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--color-text-muted); font-weight: 700; display: flex; align-items: center; gap: 8px; }
.direct-badge { font-size: 9px; text-transform: uppercase; font-weight: 800; letter-spacing: .03em; background: var(--color-surface-muted); color: var(--color-text-muted); padding: 2px 6px; border-radius: 3px; }
h1 { margin: 6px 0 4px; font-size: 1.9rem; }
.subtitle { margin: 0 0 6px; color: var(--color-text-muted); font-size: 1rem; }
.notes { margin: 0 0 12px; font-size: 13px; color: var(--color-text-muted); max-width: 70ch; line-height: 1.6; }

.meta-list { display: flex; flex-wrap: wrap; gap: 10px 22px; margin: 12px 0; }
.meta-item { display: flex; flex-direction: column; gap: 2px; }
.meta-item dt { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--color-text-muted); font-weight: 700; }
.meta-item dd { margin: 0; font-size: 14px; font-weight: 600; }

.counts { display: flex; gap: 8px; margin-top: 12px; }
.badge { font-size: 12px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 999px; padding: 3px 12px; color: var(--color-text-muted); font-weight: 600; }

.content { max-width: 1100px; margin: 0 auto; padding: 28px 32px 60px; }

.pattern-section { margin-bottom: 34px; }
.pattern-head { display: flex; align-items: center; gap: 16px; padding-bottom: 10px; border-bottom: 2px solid var(--color-border); margin-bottom: 16px; }
.pattern-id { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 70px; }
.pattern-meta h2 { margin: 0; font-size: 1.05rem; }
.count { font-size: 12px; color: var(--color-text-muted); }

.snippet-row { display: flex; flex-wrap: wrap; gap: 16px; }
.snippet { margin: 0; cursor: pointer; border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; background: white; transition: all .15s; max-width: 260px; }
.snippet:hover { border-color: var(--color-primary); box-shadow: 0 4px 14px rgba(0,0,0,.1); }
.snippet img { display: block; width: 100%; height: 120px; object-fit: contain; background: var(--color-bg); }
.snippet figcaption { padding: 7px 10px; font-size: 11px; display: flex; gap: 7px; align-items: baseline; border-top: 1px solid var(--color-border); }
.ref { font-weight: 800; color: var(--color-primary-hover); font-family: monospace; }
.cap { color: var(--color-text-muted); }
.no-snippets { font-size: 13px; color: var(--color-text-light); font-style: italic; }

.empty-state { text-align: center; padding: 70px 20px; color: var(--color-text-muted); }
.empty-state .icon { font-size: 40px; margin-bottom: 10px; }
.btn-view { margin-top: 14px; background: var(--color-primary); color: white; border: none; padding: 9px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; }

.zoom-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.75); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 24px; }
.zoom-content { background: white; border-radius: 12px; padding: 18px; max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; gap: 12px; position: relative; }
.close-btn { position: absolute; top: 8px; right: 12px; background: none; border: none; font-size: 26px; cursor: pointer; color: var(--color-text-muted); line-height: 1; }
.zoom-header { display: flex; align-items: center; gap: 12px; padding-right: 30px; }
.ref-pill { font-weight: 800; font-family: monospace; color: var(--color-primary-hover); background: var(--color-primary-light); padding: 3px 10px; border-radius: 999px; }
.zoom-img { max-width: 80vw; max-height: 65vh; object-fit: contain; background: var(--color-bg); border-radius: 6px; }
.zoom-footer { font-size: 13px; color: var(--color-text-muted); }

.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
