import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "CM Transcription Equivalents",
  description: "User Manual & Documentation",
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/docs/getting-started' }
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/docs/getting-started' },
          { text: 'Core Workflow', link: '/docs/workflow' }
        ]
      },
      {
        text: 'Features',
        items: [
          { text: 'Pattern Analysis', link: '/docs/features#pattern-analysis' },
          { text: 'Manuscript Annotation', link: '/docs/features#manuscript-annotation' },
          { text: 'Public Documentation', link: '/docs/features#public-documentation' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/timeipert/CM-Transcription-Equivalents' }
    ]
  }
})
