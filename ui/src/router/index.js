import { createRouter, createWebHashHistory } from 'vue-router'
import GlobalAnalysisView from '../views/GlobalAnalysisView.vue'
import TranscriptionEquivalentsView from '../views/TranscriptionEquivalentsView.vue'
import ManuscriptAnnotationsView from '../views/ManuscriptAnnotationsView.vue'
import SettingsView from '../views/SettingsView.vue'
import PolygonManagerView from '../views/PolygonManagerView.vue'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: GlobalAnalysisView
    },
    {
      path: '/equivalents',
      name: 'equivalents',
      component: TranscriptionEquivalentsView
    },
    {
      path: '/annotations/:id?',
      name: 'annotations',
      component: ManuscriptAnnotationsView
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView
    },
    {
      path: '/polygons',
      name: 'polygons',
      component: PolygonManagerView
    }
  ]
})

export default router
