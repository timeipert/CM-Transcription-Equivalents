import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router'
import { initPersistence } from './services/persistence/storeRegistry'

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)
// Load every persisted store from browser storage and start tracking changes,
// before anything renders.
initPersistence(pinia)
app.use(router)

app.mount('#app')
