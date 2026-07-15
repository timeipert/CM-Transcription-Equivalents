const fs = require('fs');
let content = fs.readFileSync('ui/src/App.vue', 'utf8');

// 1. Add ref
if (!content.includes('const isMenuOpen')) {
    content = content.replace("import { computed } from 'vue';", "import { computed, ref } from 'vue';");
    content = content.replace("const isPublic = computed(() => route.path.startsWith('/public'));", "const isPublic = computed(() => route.path.startsWith('/public'));\nconst isMenuOpen = ref(false);");
}

// 2. Add hamburger and toggle
if (!content.includes('hamburger-btn')) {
    content = content.replace('<div class="nav-links">', `<button class="hamburger-btn" @click="isMenuOpen = !isMenuOpen" :aria-expanded="isMenuOpen" aria-controls="nav-links" aria-label="Toggle navigation">\n        <span v-if="!isMenuOpen">☰</span>\n        <span v-else>✕</span>\n      </button>\n      <div id="nav-links" class="nav-links" :class="{ 'menu-open': isMenuOpen }" @click="isMenuOpen = false">`);
}

// 3. Fix 100vw
content = content.replace('width: 100vw;', 'width: 100%;');

// 4. Add CSS
if (!content.includes('.hamburger-btn')) {
    content = content.replace('</style>', `
/* Responsive Nav */
.hamburger-btn {
  display: none;
  background: transparent;
  border: none;
  color: var(--color-surface);
  font-size: 1.5rem;
  padding: 0.5rem;
  cursor: pointer;
  z-index: 100;
}

@media (max-width: 768px) {
  .hamburger-btn {
    display: block;
  }
  
  .nav-links {
    position: fixed;
    top: 50px;
    left: 0;
    right: 0;
    background: var(--color-nav-bg);
    flex-direction: column;
    padding: 1rem;
    gap: 1rem;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    transform: translateY(-150%);
    opacity: 0;
    transition: all 0.3s ease-in-out;
    z-index: 99;
  }
  
  .nav-links.menu-open {
    transform: translateY(0);
    opacity: 1;
  }
  
  .nav-links a, .nav-links .public-ext-link {
    margin: 0 !important;
    text-align: center;
    padding: 0.75rem;
    width: 100%;
    box-sizing: border-box;
  }
}
</style>`);
}

fs.writeFileSync('ui/src/App.vue', content);
