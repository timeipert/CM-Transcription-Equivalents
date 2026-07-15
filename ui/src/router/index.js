import { createRouter, createWebHashHistory } from 'vue-router'
import GlobalAnalysisView from '../views/GlobalAnalysisView.vue'
import TranscriptionEquivalentsView from '../views/TranscriptionEquivalentsView.vue'
import ManuscriptAnnotationsView from '../views/ManuscriptAnnotationsView.vue'
import SettingsView from '../views/SettingsView.vue'
import PolygonManagerView from '../views/PolygonManagerView.vue'
import PublicManuscriptsView from '../views/PublicManuscriptsView.vue'
import PublicNotationView from '../views/PublicNotationView.vue'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: GlobalAnalysisView,
      meta: { title: 'Global Analysis' }
    },
    {
      path: '/equivalents',
      name: 'equivalents',
      component: TranscriptionEquivalentsView,
      meta: { title: 'Transcription Equivalents' }
    },
    {
      path: '/annotations/:id?',
      name: 'annotations',
      component: ManuscriptAnnotationsView,
      meta: { title: 'Manuscript Annotations' }
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
      meta: { title: 'Settings' }
    },
    {
      path: '/polygons',
      name: 'polygons',
      component: PolygonManagerView,
      meta: { title: 'Manuscripts' }
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

router.afterEach((to) => {
  let title = to.meta.title || '';
  
  if (to.params.id) {
    title = `${to.params.id} — ${title}`;
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
