import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router'
import { initPersistence } from './services/persistence/storeRegistry'
import { initPageKeyMigration } from './composables/usePageKeyMigration'
import { useWorkspaceStorage } from './composables/useWorkspaceStorage'

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)
// Load every persisted store from browser storage and start tracking changes,
// before anything renders.
initPersistence(pinia)
app.use(router)

// Keep stored pages on the transcription's folios (older versions sometimes keyed
// them by a scan label); tell the user through the save-status notice.
const { notice } = useWorkspaceStorage()
initPageKeyMigration({
    notify: message => { notice.value = notice.value ? `${notice.value} ${message}` : message }
})

app.mount('#app')
