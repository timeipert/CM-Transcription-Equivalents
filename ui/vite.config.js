import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: '../docs',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // The framework changes rarely, the app code with every deploy: keeping
        // them apart lets returning visitors reuse the cached framework chunk.
        manualChunks(id) {
          if (/node_modules\/(vue|@vue|pinia|vue-router)\//.test(id)) return 'vendor'
        }
      }
    }
  }
})
