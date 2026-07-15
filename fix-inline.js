const fs = require('fs');

const patches = [
    {
        file: 'ui/src/components/gallery/GalleryModal.vue',
        replacements: [
            { from: `style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;"`, to: `class="modal-header-actions"` },
            { from: `style="display: flex; align-items: center; gap: 15px;"`, to: `class="modal-controls"` }
        ],
        css: `\n.modal-header-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); }\n.modal-controls { display: flex; align-items: center; gap: 15px; }\n`
    },
    {
        file: 'ui/src/components/manager/ManagerSidebar.vue',
        replacements: [
            { from: `style="padding:10px; color:var(--color-text-light);"`, to: `class="empty-state"` },
            { from: `style="margin-top: 15px; display: flex; justify-content: flex-end;"`, to: `class="modal-actions"` }
        ],
        css: `\n.empty-state { padding: 10px; color: var(--color-text-light); }\n.modal-actions { margin-top: 15px; display: flex; justify-content: flex-end; }\n`
    },
    {
        file: 'ui/src/components/manager/ManagerWorkspace.vue',
        replacements: [
            { from: `style="margin-right: 10px;"`, to: `class="mr-10"` },
            { from: `style="display: flex; justify-content: space-between; align-items: center;"`, to: `class="flex-between-center"` },
            { from: `style="padding: 2px; font-size: 11px; border-radius: 4px;"`, to: `class="small-select"` },
            { from: `style="color: var(--color-text-muted);"`, to: `class="text-muted"` },
            { from: `style="display:flex; align-items:center; gap: 12px;"`, to: `class="flex-center-gap"` },
            { from: `style="margin:0"`, to: `class="m-0"` }
        ],
        css: `\n.mr-10 { margin-right: 10px; }\n.flex-between-center { display: flex; justify-content: space-between; align-items: center; }\n.small-select { padding: 2px; font-size: 11px; border-radius: 4px; }\n.text-muted { color: var(--color-text-muted); }\n.flex-center-gap { display: flex; align-items: center; gap: 12px; }\n.m-0 { margin: 0; }\n`
    },
    {
        file: 'ui/src/views/TranscriptionEquivalentsView.vue',
        replacements: [
            { from: `style="width: 100px;"`, to: `class="w-100"` }
        ],
        css: `\n.w-100 { width: 100px; }\n`
    },
    {
        file: 'ui/src/views/SettingsView.vue',
        replacements: [
            { from: `style="display:none"`, to: `class="d-none"` },
            { from: `style="flex: 1"`, to: `class="flex-1"` },
            { from: `style="border-color: var(--color-danger, var(--color-danger));"`, to: `class="border-danger"` },
            { from: `style="margin-right:8px;"`, to: `class="mr-8"` },
            { from: `style="margin-bottom:15px;"`, to: `class="mb-15"` },
            { from: `style="margin-top:0;"`, to: `class="mt-0"` },
            { from: `style="width:80px; padding:6px;"`, to: `class="w-80-p6"` },
            { from: `style="font-size:0.8em; color:var(--color-text-light);"`, to: `class="text-sm-light"` },
            { from: `style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"`, to: `class="flex-between-mb10"` },
            { from: `style="font-weight:bold;"`, to: `class="fw-bold"` },
            { from: `style="font-size:0.85em; color:var(--color-text-muted); margin-top:0;"`, to: `class="text-sm-muted-mt0"` },
            { from: `style="margin-top:20px;"`, to: `class="mt-20"` },
            { from: `style="margin-bottom:10px;"`, to: `class="mb-10"` },
            { from: `style="width:60px; padding:4px;"`, to: `class="w-60-p4"` },
            { from: `style="background:transparent; padding:0; margin-top:15px; border-top:1px solid var(--color-border); padding-top:15px; justify-content: flex-end;"`, to: `class="add-row-actions"` },
            { from: `style="margin-right:auto;"`, to: `class="mr-auto"` }
        ],
        css: `\n.d-none { display: none; }\n.flex-1 { flex: 1; }\n.border-danger { border-color: var(--color-danger); }\n.mr-8 { margin-right: 8px; }\n.mb-15 { margin-bottom: 15px; }\n.mt-0 { margin-top: 0; }\n.w-80-p6 { width: 80px; padding: 6px; }\n.text-sm-light { font-size: 0.8em; color: var(--color-text-light); }\n.flex-between-mb10 { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }\n.fw-bold { font-weight: bold; }\n.text-sm-muted-mt0 { font-size: 0.85em; color: var(--color-text-muted); margin-top: 0; }\n.mt-20 { margin-top: 20px; }\n.mb-10 { margin-bottom: 10px; }\n.w-60-p4 { width: 60px; padding: 4px; }\n.add-row-actions { background: transparent; padding: 0; margin-top: 15px; border-top: 1px solid var(--color-border); padding-top: 15px; justify-content: flex-end; display: flex; }\n.mr-auto { margin-right: auto; }\n`
    },
    {
        file: 'ui/src/views/PublicManuscriptsView.vue',
        replacements: [
            { from: `style="text-align: right;"`, to: `class="text-right"` },
            { from: `style="text-align: right; width: 100px;"`, to: `class="text-right w-100"` }
        ],
        css: `\n.text-right { text-align: right; }\n.w-100 { width: 100px; }\n`
    },
    {
        file: 'ui/src/views/PublicNotationView.vue',
        replacements: [
            { from: `style="width: 70px"`, to: `class="w-70"` },
            { from: `style="width: 140px"`, to: `class="w-140"` }
        ],
        css: `\n.w-70 { width: 70px; }\n.w-140 { width: 140px; }\n`
    },
    {
        file: 'ui/src/views/ManuscriptAnnotationsView.vue',
        replacements: [
            { from: `style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;"`, to: `class="flex-between-mb8"` },
            { from: `style="margin-bottom: 0;"`, to: `class="mb-0"` },
            { from: `style="padding: 2px; font-size: 11px; border-radius: 4px;"`, to: `class="small-select"` },
            { from: `style="width: 140px;"`, to: `class="w-140"` },
            { from: `style="display:flex; gap:10px; align-items:center; justify-content:center;"`, to: `class="flex-center-gap10"` }
        ],
        css: `\n.flex-between-mb8 { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }\n.mb-0 { margin-bottom: 0; }\n.small-select { padding: 2px; font-size: 11px; border-radius: 4px; }\n.w-140 { width: 140px; }\n.flex-center-gap10 { display: flex; gap: 10px; align-items: center; justify-content: center; }\n`
    }
];

for (const patch of patches) {
    if (!fs.existsSync(patch.file)) continue;
    let content = fs.readFileSync(patch.file, 'utf8');
    let original = content;
    for (const r of patch.replacements) {
        content = content.replace(new RegExp(r.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), r.to);
    }
    if (content !== original) {
        if (content.includes('</style>')) {
            content = content.replace('</style>', patch.css + '</style>');
        } else {
            content += `\n<style scoped>${patch.css}</style>\n`;
        }
        fs.writeFileSync(patch.file, content);
        console.log(`Updated ${patch.file}`);
    }
}
