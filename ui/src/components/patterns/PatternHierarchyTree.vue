<script setup>
/**
 * Collapsible three-level pattern hierarchy:
 *   direction -> ligature status -> modifiers -> pattern codes.
 *
 * Shared by the pattern library page and the public views, so all three show
 * the same structure. Everything below a group header is rendered through the
 * default slot, which receives the pattern code.
 */
import { ref, computed } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import { buildPatternHierarchy } from '../../utils/patternCode';

const props = defineProps({
    codes: { type: Array, default: () => [] },
    // Start expanded (the library page defaults to collapsed, per spec)
    defaultOpen: { type: Boolean, default: false },
    // Force every group open, e.g. while a search filter is active
    forceOpen: { type: Boolean, default: false },
    // Show "n" badges next to group headers
    showCounts: { type: Boolean, default: true },
    emptyText: { type: String, default: 'Keine Pattern vorhanden.' }
});

const settings = useSettingsStore();

// The grouping needs the project's sign vocabulary to tell a custom sign letter
// apart from a built-in note-shape suffix.
const tree = computed(() => buildPatternHierarchy(props.codes, {
    signKeys: settings.customSigns.map(s => s.key),
    customSigns: settings.customSigns
}));

// Open state keyed by path, so expanding survives re-renders of the tree
const openPaths = ref(new Set());

function pathKey(...parts) {
    return parts.join('/');
}

function isOpen(key) {
    if (props.forceOpen) return true;
    if (props.defaultOpen) return !openPaths.value.has(key); // set = explicitly closed
    return openPaths.value.has(key);
}

function toggle(key) {
    const next = new Set(openPaths.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    openPaths.value = next;
}

function expandAll() {
    const next = new Set();
    if (!props.defaultOpen) {
        for (const dir of tree.value) {
            next.add(pathKey(dir.key));
            for (const lig of dir.groups) {
                next.add(pathKey(dir.key, lig.key));
                for (const mod of lig.groups) next.add(pathKey(dir.key, lig.key, mod.key));
            }
        }
    }
    openPaths.value = next;
}

function collapseAll() {
    if (!props.defaultOpen) {
        openPaths.value = new Set();
        return;
    }
    const next = new Set();
    for (const dir of tree.value) {
        next.add(pathKey(dir.key));
        for (const lig of dir.groups) {
            next.add(pathKey(dir.key, lig.key));
            for (const mod of lig.groups) next.add(pathKey(dir.key, lig.key, mod.key));
        }
    }
    openPaths.value = next;
}

defineExpose({ expandAll, collapseAll });
</script>

<template>
<div class="hierarchy">
    <div v-if="tree.length === 0" class="hierarchy-empty">{{ emptyText }}</div>

    <div v-for="dir in tree" :key="dir.key" class="level level-1">
        <button
            type="button"
            class="group-head head-1"
            :aria-expanded="isOpen(pathKey(dir.key))"
            @click="toggle(pathKey(dir.key))"
        >
            <span class="caret" :class="{ open: isOpen(pathKey(dir.key)) }">▸</span>
            <span class="group-label">{{ dir.label }}</span>
            <span v-if="showCounts" class="group-count">{{ dir.count }}</span>
        </button>

        <div v-if="isOpen(pathKey(dir.key))" class="level-body">
            <div v-for="lig in dir.groups" :key="lig.key" class="level level-2">
                <button
                    type="button"
                    class="group-head head-2"
                    :aria-expanded="isOpen(pathKey(dir.key, lig.key))"
                    @click="toggle(pathKey(dir.key, lig.key))"
                >
                    <span class="caret" :class="{ open: isOpen(pathKey(dir.key, lig.key)) }">▸</span>
                    <span class="group-label">{{ lig.label }}</span>
                    <span v-if="showCounts" class="group-count">{{ lig.count }}</span>
                </button>

                <div v-if="isOpen(pathKey(dir.key, lig.key))" class="level-body">
                    <div v-for="mod in lig.groups" :key="mod.key" class="level level-3">
                        <button
                            type="button"
                            class="group-head head-3"
                            :aria-expanded="isOpen(pathKey(dir.key, lig.key, mod.key))"
                            @click="toggle(pathKey(dir.key, lig.key, mod.key))"
                        >
                            <span class="caret" :class="{ open: isOpen(pathKey(dir.key, lig.key, mod.key)) }">▸</span>
                            <span class="group-label">{{ mod.label }}</span>
                            <span v-if="showCounts" class="group-count">{{ mod.count }}</span>
                        </button>

                        <div v-if="isOpen(pathKey(dir.key, lig.key, mod.key))" class="leaf-body">
                            <slot v-for="code in mod.codes" :key="code" :code="code" :modifier="mod.key">
                                <span class="fallback-leaf">{{ code }}</span>
                            </slot>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
</template>

<style scoped>
.hierarchy { display: flex; flex-direction: column; gap: 4px; }
.hierarchy-empty { padding: 20px; text-align: center; color: var(--color-text-muted); font-size: 0.9rem; }

.group-head {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    padding: 6px 10px;
    font-size: 0.88rem;
    cursor: pointer;
}
.group-head:hover { background: var(--color-surface-muted); border-color: var(--color-border); }

.head-1 { font-weight: 700; color: var(--color-text); background: var(--color-surface-muted); }
.head-2 { font-weight: 600; color: var(--color-text-muted); font-size: 0.83rem; }
.head-3 { font-weight: 600; color: var(--color-text-light); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; }

.caret { display: inline-block; transition: transform 0.15s ease; font-size: 0.7em; opacity: 0.7; }
.caret.open { transform: rotate(90deg); }

.group-label { flex: 1; }
.group-count {
    font-size: 0.7rem;
    font-weight: 700;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    border-radius: 10px;
    padding: 1px 7px;
}

.level-body { padding-left: 14px; border-left: 1px solid var(--color-border); margin-left: 12px; }
.leaf-body { padding: 4px 0 8px 26px; display: flex; flex-direction: column; gap: 6px; }
.fallback-leaf { font-family: monospace; }
</style>
