<script setup>
import { ref, computed, onBeforeUnmount } from 'vue';
import { yearLabel } from '../utils/sourceMeta';

/**
 * A draggable timeline for filtering by date.
 *
 * Two handles bound a selected span; every source is drawn as a mark at its own
 * dated range, so the reader can see where the material actually clusters
 * before choosing a window. Selection is by *overlap*, not containment — a
 * source dated "11th–12th c." should surface when looking at 1150, even though
 * it is not wholly inside that window.
 *
 * Drawn as SVG rather than <canvas>: the marks stay crisp at any zoom, the
 * handles can take real focus for keyboard use, and tick labels are selectable
 * text rather than pixels.
 */

const props = defineProps({
    // Selected span, inclusive years.
    from: { type: Number, required: true },
    to: { type: Number, required: true },
    // Full extent of the axis.
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    // [{ start, end, label }] — one per dated source.
    points: { type: Array, default: () => [] }
});

const emit = defineEmits(['update:from', 'update:to']);

const W = 1000;            // viewBox width; the SVG scales to its container
const H = 74;
const PAD = 14;            // horizontal padding so end handles are not clipped
const TRACK_Y = 46;
const TRACK_H = 9;

const span = computed(() => Math.max(1, props.max - props.min));
const toX = (year) => PAD + ((year - props.min) / span.value) * (W - PAD * 2);
const toYear = (x) => props.min + ((x - PAD) / (W - PAD * 2)) * span.value;

const fromX = computed(() => toX(props.from));
const toXPos = computed(() => toX(props.to));

/** Century gridlines across the visible extent. */
const ticks = computed(() => {
    const out = [];
    // Aim for ~10 labelled ticks; fall back to 50/100/200-year steps.
    const rough = span.value / 10;
    const step = [25, 50, 100, 200, 250, 500].find(s => s >= rough) || 500;
    const first = Math.ceil(props.min / step) * step;
    for (let y = first; y <= props.max; y += step) {
        out.push({ year: y, x: toX(y) });
    }
    return out;
});

/**
 * Marks are stacked into rows so overlapping datings stay visible instead of
 * drawing on top of each other.
 */
const marks = computed(() => {
    const rows = [];
    const out = [];
    const sorted = [...props.points].sort((a, b) => a.start - b.start);
    for (const p of sorted) {
        const x1 = toX(Math.max(p.start, props.min));
        const x2 = toX(Math.min(p.end, props.max));
        const w = Math.max(3, x2 - x1);
        let row = rows.findIndex(endX => x1 > endX + 6);
        if (row === -1) { row = rows.length; rows.push(0); }
        rows[row] = x1 + w;
        out.push({
            ...p,
            x: x1,
            w,
            row: Math.min(row, 3),   // cap the stack; deeper rows reuse the last
            selected: p.start <= props.to && props.from <= p.end
        });
    }
    return out;
});

// --- Dragging -------------------------------------------------------------
const svgEl = ref(null);
const dragging = ref('');   // '' | 'from' | 'to'

function yearAtEvent(e) {
    const rect = svgEl.value.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    return Math.round(Math.min(props.max, Math.max(props.min, toYear(x))));
}

function startDrag(which, e) {
    dragging.value = which;
    e.preventDefault();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
}

function onMove(e) {
    if (!dragging.value) return;
    const y = yearAtEvent(e);
    if (dragging.value === 'from') emit('update:from', Math.min(y, props.to));
    else emit('update:to', Math.max(y, props.from));
}

function endDrag() {
    dragging.value = '';
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', endDrag);
}

onBeforeUnmount(endDrag);

/** Clicking the track moves whichever handle is nearer — faster than dragging. */
function onTrackClick(e) {
    if (dragging.value) return;
    const y = yearAtEvent(e);
    const dFrom = Math.abs(y - props.from);
    const dTo = Math.abs(y - props.to);
    if (dFrom <= dTo) emit('update:from', Math.min(y, props.to));
    else emit('update:to', Math.max(y, props.from));
}

/** Arrow keys nudge; shift jumps a decade. Without this the filter is mouse-only. */
function onKey(which, e) {
    const stepMap = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1 };
    const dir = stepMap[e.key];
    if (dir === undefined) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    if (which === 'from') {
        emit('update:from', Math.max(props.min, Math.min(props.from + dir * step, props.to)));
    } else {
        emit('update:to', Math.min(props.max, Math.max(props.to + dir * step, props.from)));
    }
}
</script>

<template>
<div class="timeline">
    <div class="readout">
        <span class="readout-from">{{ yearLabel(from) }}</span>
        <span class="readout-dash">–</span>
        <span class="readout-to">{{ yearLabel(to) }}</span>
        <span class="readout-count">{{ marks.filter(m => m.selected).length }} of {{ marks.length }} dated</span>
    </div>

    <svg ref="svgEl" class="tl-svg" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none"
         @click="onTrackClick">
        <!-- Century gridlines -->
        <g class="ticks">
            <line v-for="t in ticks" :key="'l'+t.year" :x1="t.x" :x2="t.x" y1="10" :y2="TRACK_Y + TRACK_H + 4" />
        </g>

        <!-- Data marks, one per dated source -->
        <g class="marks">
            <rect v-for="(m, i) in marks" :key="'m'+i"
                  :x="m.x" :y="10 + m.row * 7" :width="m.w" height="5" rx="2.5"
                  :class="{ sel: m.selected }">
                <title>{{ m.label }}</title>
            </rect>
        </g>

        <!-- Track and selection -->
        <rect class="track" :x="PAD" :y="TRACK_Y" :width="W - PAD * 2" :height="TRACK_H" :rx="TRACK_H / 2" />
        <rect class="track-sel" :x="fromX" :y="TRACK_Y" :width="Math.max(1, toXPos - fromX)" :height="TRACK_H" :rx="TRACK_H / 2" />

        <!-- Handles -->
        <g class="handle" :class="{ dragging: dragging === 'from' }"
           :transform="`translate(${fromX}, ${TRACK_Y + TRACK_H / 2})`"
           tabindex="0" role="slider" aria-label="From year"
           :aria-valuemin="min" :aria-valuemax="to" :aria-valuenow="from"
           @pointerdown.stop="startDrag('from', $event)"
           @keydown="onKey('from', $event)"
           @click.stop>
            <circle r="11" class="hit" />
            <circle r="7" class="knob" />
        </g>
        <g class="handle" :class="{ dragging: dragging === 'to' }"
           :transform="`translate(${toXPos}, ${TRACK_Y + TRACK_H / 2})`"
           tabindex="0" role="slider" aria-label="To year"
           :aria-valuemin="from" :aria-valuemax="max" :aria-valuenow="to"
           @pointerdown.stop="startDrag('to', $event)"
           @keydown="onKey('to', $event)"
           @click.stop>
            <circle r="11" class="hit" />
            <circle r="7" class="knob" />
        </g>

        <!-- Axis labels -->
        <g class="tick-labels">
            <text v-for="t in ticks" :key="'t'+t.year" :x="t.x" :y="H - 4">{{ t.year }}</text>
        </g>
    </svg>
</div>
</template>

<style scoped>
.timeline { width: 100%; }

.readout {
    display: flex; align-items: baseline; gap: 5px;
    font-size: 13px; font-weight: 800; color: var(--color-primary-hover);
    margin-bottom: 2px;
}
.readout-dash { opacity: .6; }
.readout-count { margin-left: auto; font-size: 10px; font-weight: 600; color: var(--color-text-muted); }

.tl-svg { width: 100%; height: 74px; display: block; overflow: visible; touch-action: none; cursor: pointer; }

.ticks line { stroke: var(--color-border); stroke-width: 1; }
.tick-labels text {
    font-size: 9px; fill: var(--color-text-muted);
    text-anchor: middle; font-family: inherit;
}

.marks rect { fill: var(--color-border-hover); opacity: .55; transition: fill .12s, opacity .12s; }
.marks rect.sel { fill: var(--color-primary); opacity: 1; }

.track { fill: var(--color-surface-muted); }
.track-sel { fill: var(--color-primary); opacity: .30; }

.handle { cursor: grab; }
.handle.dragging { cursor: grabbing; }
.handle .hit { fill: transparent; }
.handle .knob {
    fill: #fff; stroke: var(--color-primary); stroke-width: 3;
    transition: transform .1s;
}
.handle:hover .knob, .handle.dragging .knob { stroke: var(--color-primary-hover); }
.handle:focus { outline: none; }
.handle:focus-visible .knob { stroke: var(--color-accent, #f59e0b); stroke-width: 4; }
</style>
