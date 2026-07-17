import { createRouter, createWebHashHistory } from 'vue-router'
import GlobalAnalysisView from '../views/GlobalAnalysisView.vue'
import TranscriptionEquivalentsView from '../views/TranscriptionEquivalentsView.vue'
import ManuscriptAnnotationsView from '../views/ManuscriptAnnotationsView.vue'
import SettingsView from '../views/SettingsView.vue'
import PolygonManagerView from '../views/PolygonManagerView.vue'
import PublicManuscriptsView from '../views/PublicManuscriptsView.vue'
import PublicNotationView from '../views/PublicNotationView.vue'
import SetupView from '../views/SetupView.vue'

// Import storage for guard
import { useWorkspaceStorage } from '../composables/useWorkspaceStorage';
import { usePersonalTablesStore } from '../stores/personalTables';

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/setup',
      name: 'setup',
      component: SetupView,
      meta: { title: 'Workspace Setup' }
    },
    {
      path: '/',
      name: 'home',
      component: GlobalAnalysisView,
      meta: { title: 'Global Analysis', requiresWorkspace: true }
    },
    {
      path: '/equivalents',
      name: 'equivalents',
      component: TranscriptionEquivalentsView,
      meta: { title: 'Transcription Equivalents', requiresWorkspace: true }
    },
    {
      path: '/annotations/:id?',
      name: 'annotations',
      component: ManuscriptAnnotationsView,
      meta: { title: 'Manuscript Annotations', requiresWorkspace: true }
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
      meta: { title: 'Settings', requiresWorkspace: true }
    },
    {
      path: '/polygons',
      name: 'polygons',
      component: PolygonManagerView,
      meta: { title: 'Manuscripts', requiresWorkspace: true }
    },
    {
      path: '/public',
      name: 'public_directory',
      component: PublicManuscriptsView,
      meta: { title: 'Public Directory' }
    },
    {
      path: '/public/:source',
      name: 'public_notation',
      component: PublicNotationView,
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
    document.title = `${title} — CM Transcription`;
  } else {
    document.title = 'CM Transcription';
  }
})

export default router
