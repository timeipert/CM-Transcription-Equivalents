<script setup>
import { useOmmrContext } from '../../composables/ommr/ommrContext';
import PatternDisplay from '../../components/PatternDisplay.vue';
import OmmrLineStrip from '../../components/OmmrLineStrip.vue';
import { markedNeumes } from '../../utils/ommrOptimizers';

const {
    deskewFor,
    effFolio,
    localFor,
    serviceUrlFor,
    showLinePreview,
    lineCoverage,
    glyphs
} = useOmmrContext();
</script>

<template>
    <div v-if="showLinePreview" class="ommr-ui preview-overlay" @click.self="showLinePreview = false">
        <div class="preview-panel wide">
            <header class="preview-head">
                <div>
                    <h3>Line coverage preview</h3>
                    <span class="preview-sub" v-if="lineCoverage">
                        {{ lineCoverage.lines.length }} lines · covers {{ lineCoverage.covered }}/{{ lineCoverage.total }} patterns
                        (of {{ lineCoverage.totalLines }} lines)
                    </span>
                </div>
                <button class="close-btn" @click="showLinePreview = false">✕</button>
            </header>
            <div class="preview-body" v-if="lineCoverage">
                <div v-for="(item, i) in lineCoverage.lines" :key="item.line.id + i" class="line-row">
                    <div class="line-meta">
                        <span class="line-loc">Fol. {{ item.line.folio }} · {{ item.line.id.split(':').pop() }}</span>
                        <span class="line-newpats">
                            <span class="newpat-label">adds:</span>
                            <PatternDisplay v-for="p in item.newPatterns" :key="p" :pattern="p" :glyphs="glyphs" class="ln-pat" />
                        </span>
                    </div>
                    <OmmrLineStrip
                        :source="item.line.source"
                        :folio="effFolio(item.line.folio)"
                        :bbox="item.line.bbox"
                        :neumes="markedNeumes(item)"
                        :localSrc="localFor(item.line)"
                        :serviceUrl="serviceUrlFor(item.line)"
                        :deskewAngle="deskewFor(item.line.folio).angle"
                        :pageW="deskewFor(item.line.folio).w"
                        :pageH="deskewFor(item.line.folio).h"
                        :width="820"
                    />
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.line-row { padding: 10px 0 16px; border-bottom: 1px solid var(--color-border); }
.line-meta { display: flex; align-items: center; gap: 14px; margin-bottom: 6px; flex-wrap: wrap; }
.line-loc { font-weight: 600; font-size: 0.82rem; }
.line-newpats { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.newpat-label { font-size: 0.72rem; color: var(--color-text-muted); }
.line-newpats .ln-pat { transform: scale(0.8); }
</style>
