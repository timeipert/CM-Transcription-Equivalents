<script setup>
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell">
    <nav class="top-nav">
      <div class="nav-brand">CM Transcription Equivalents</div>
      <div class="nav-links">
        <RouterLink to="/" active-class="active">Overview</RouterLink>
        <RouterLink to="/my-tables" active-class="active">Custom Tables</RouterLink>
        <RouterLink to="/polygons" active-class="active">Manuscript Annotation</RouterLink>
        <RouterLink to="/settings" active-class="active">Settings</RouterLink>
      </div>
    </nav>
    
    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.top-nav {
  flex: 0 0 50px;
  background: #2c3e50;
  color: rgb(255, 255, 255);
  display: flex;
  align-items: center;
  padding: 0 20px;
  justify-content: space-between;
}

.nav-brand {
  font-weight: 700;
  font-size: 1.1em;
}

.nav-links a {
  color: rgb(177, 177, 177);
  text-decoration: none;
  margin-left: 20px;
  font-size: 0.95em;
  padding: 5px 10px;
  border-radius: 4px;
  transition: all 0.2s;
}

.nav-links a.active, .nav-links a:hover {
  color: rgb(244, 244, 244);
  background: rgba(255, 255, 255, 0.2);
  font-weight: 600;
}

.main-content {
  flex: 1;
  overflow: auto; /* Allow scrolling */
  background: #f4f6f8;
  width: 100%;
}

/* Scrollbar styling for Webkit */
.main-content::-webkit-scrollbar { width: 8px; height: 8px; }
.main-content::-webkit-scrollbar-thumb { background: #ccc; border-radius: 4px; }
</style>
