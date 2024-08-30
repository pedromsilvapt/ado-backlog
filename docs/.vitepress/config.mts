import { defineConfig } from 'vitepress'
import { join } from 'path';
import fs from 'fs';

var kdlLang = JSON.parse(fs.readFileSync(join(__dirname, './languages/kdl.tmLanguage.json'), 'utf8'));

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "ADO Backlog",
  description: "Azure DevOps Backlog Exporter Tool",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/command-line' },
      { text: 'Release Notes', link: '/release-notes' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Config Examples', link: '/guide/config-examples' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Command Line', link: '/refence/command-line' },
            { text: 'Configuration', link: '/reference/configuration' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
    ],

    search: {
      provider: 'local'
    }
  },
  markdown: {
    languages: [ kdlLang ],
    languageAlias: {
      kdl: 'KDL'
    }
  }
})
