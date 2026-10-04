<script setup>
import { useSettingsStore } from '../../stores/settings';

const store = useSettingsStore();
</script>

<template>
    <div class="card section settings-card">
            <h2>App Defaults</h2>
        
            <div class="setting-row">
                <label>Global Pattern View (Standard)</label>
                <select v-model="store.displayMode">
                    <option value="svg">Graphic (SVG)</option>
                    <option value="arrow">Arrows (↗/↘)</option>
                    <option value="text">Text (u/d/e)</option>
                </select>
            </div>
        
            <div class="setting-row">
                <label>
                    <input type="checkbox" v-model="store.autoFillIds">
                    Auto-fill Custom IDs in Editor (using preferences below)
                </label>
            </div>
        </div>
</template>
