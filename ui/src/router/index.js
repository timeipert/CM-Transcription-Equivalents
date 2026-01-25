import { createRouter, createWebHashHistory } from 'vue-router'
import GlobalAnalysisView from '../views/GlobalAnalysisView.vue'
import MyTablesView from '../views/MyTablesView.vue'
import EditTableView from '../views/EditTableView.vue'
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
      path: '/my-tables',
      name: 'my-tables',
      component: MyTablesView
    },
    {
      path: '/table/:id?',
      name: 'edit-table',
      component: EditTableView
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
