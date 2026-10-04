import { createRouter, createWebHashHistory } from 'vue-router'
// Import storage for guard
import { useWorkspaceStorage } from '../composables/useWorkspaceStorage';
import { usePersonalTablesStore } from '../stores/personalTables';

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/setup',
      name: 'setup',
      component: () => import('../views/SetupView.vue'),
      meta: { title: 'Workspace Setup' }
    },
    {
      path: '/',
      name: 'home',
      component: () => import('../views/GlobalAnalysisView.vue'),
      meta: { title: 'Global Analysis', requiresWorkspace: true }
    },
    {
      path: '/patterns',
      name: 'patterns',
      component: () => import('../views/PatternLibraryView.vue'),
      meta: { title: 'Pattern Library', requiresWorkspace: true }
    },
    {
      path: '/equivalents',
      name: 'equivalents',
      component: () => import('../views/TranscriptionEquivalentsView.vue'),
      meta: { title: 'Transcription Equivalents', requiresWorkspace: true }
    },
    {
      path: '/annotations/:id?',
      name: 'annotations',
      component: () => import('../views/ManuscriptAnnotationsView.vue'),
      meta: { title: 'Manuscript Annotations', requiresWorkspace: true }
    },
    {
      path: '/ommr',
      name: 'ommr_explorer',
      component: () => import('../views/OmmrExplorerView.vue'),
      meta: { title: 'Import', requiresWorkspace: true }
    },
    {
      path: '/custom-manuscripts',
      name: 'custom_manuscripts',
      component: () => import('../views/CustomManuscriptsView.vue'),
      meta: { title: 'Custom Manuscripts', requiresWorkspace: true }
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
      meta: { title: 'Settings', requiresWorkspace: true }
    },
    {
      path: '/polygons',
      name: 'polygons',
      component: () => import('../views/PolygonManagerView.vue'),
      meta: { title: 'Manuscripts', requiresWorkspace: true }
    },
    {
      path: '/polygons/edit-region',
      name: 'region_editor',
      component: () => import('../views/RegionEditorView.vue'),
      meta: { title: 'Edit Line Region', requiresWorkspace: true }
    },
    {
      path: '/public',
      name: 'public_directory',
      component: () => import('../views/PublicManuscriptsView.vue'),
      meta: { title: 'Public Directory' }
    },
    {
      path: '/public/table',
      name: 'public_neume_table',
      component: () => import('../views/PublicNeumeTableView.vue'),
      meta: { title: 'Neume Table' }
    },
    {
      path: '/public/custom/:source',
      name: 'public_custom_manuscript',
      component: () => import('../views/PublicCustomManuscriptView.vue'),
      meta: { title: 'Custom Manuscript' }
    },
    {
      path: '/public/:source',
      name: 'public_notation',
      component: () => import('../views/PublicNotationView.vue'),
      meta: { title: 'Public Notation' }
    }
  ]
})

// Onboarding Gate Navigation Guard
router.beforeEach(async (to, from) => {
  if (to.meta.requiresWorkspace) {
    const storage = useWorkspaceStorage(); // safe after pinia is active
    
    // Wait for IDB to finish loading its handle
    await storage.initPromise;
    
    if (!storage.folderName.value && !storage.isStorageBypassed.value) {
      return { name: 'setup', query: { redirect: to.fullPath } };
    }
  }
})

// Views are loaded on demand. A tab that stayed open across a new deployment asks
// for chunk files that no longer exist; reload once to pick up the new build
// instead of leaving the navigation silently dead.
const CHUNK_RELOAD_FLAG = 'chunk_reload_attempted'
router.onError((error, to) => {
  const isChunkError = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i
    .test(error?.message || '')
  if (!isChunkError || sessionStorage.getItem(CHUNK_RELOAD_FLAG)) return
  sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1')
  window.location.hash = to?.fullPath || '/'
  window.location.reload()
})

router.afterEach(() => {
  sessionStorage.removeItem(CHUNK_RELOAD_FLAG)
})

router.afterEach((to) => {
  let title = to.meta.title || '';
  
  if (to.params.id) {
    try {
      const tablesStore = usePersonalTablesStore();
      const table = tablesStore.tables.find(t => t.id === to.params.id);
      if (table && table.name) {
        title = `${table.name} — ${title}`;
      } else if (table && table.source) {
        title = `${table.source} — ${title}`;
      } else {
        title = `${to.params.id} — ${title}`;
      }
    } catch (e) {
      title = `${to.params.id} — ${title}`;
    }
  } else if (to.params.source) {
    title = `${to.params.source} — ${title}`;
  }

  if (title) {
    document.title = `${title} — Neume Viewer`;
  } else {
    document.title = 'Neume Viewer';
  }
})

export default router
