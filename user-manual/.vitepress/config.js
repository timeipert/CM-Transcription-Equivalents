import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "CM Transcription Equivalents",
  description: "User Manual & Documentation",
  base: '/manual/',
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
          { text: 'Conventions & Terminology', link: '/docs/conventions' },
          { text: 'Core Workflow', link: '/docs/workflow' }
        ]
      },
      {
        text: 'Features & Usage',
        items: [
          { text: 'Equivalents Management', link: '/docs/equivalents' },
          { text: 'Manuscript Annotation', link: '/docs/annotation' },
          { text: 'Settings & Data Backup', link: '/docs/settings-and-data' },
          { text: 'Public Documentation', link: '/docs/public-view' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/timeipert/CM-Transcription-Equivalents' }
    ]
  }
})
