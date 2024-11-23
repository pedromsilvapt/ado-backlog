import { defineConfig } from 'vitepress'
import { transformerNotationWordHighlight } from '@shikijs/transformers';
import { join } from 'path';
import fs from 'fs';

var kdlLang = JSON.parse(fs.readFileSync(join(__dirname, './languages/kdl.tmlanguage.json'), 'utf8'));

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "ADO Backlog",
  description: "Azure DevOps Backlog Exporter Tool",
  cleanUrls: true,
  base: '/ado-backlog/',
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      // { text: 'Reference', link: '/reference/command-line' },
      { text: 'Release Notes', link: '/release-notes' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            {
              text: 'Configuration',
              items: [
                { text: 'API', link: '/guide/configuration/api' },
                { text: 'Backlog', link: '/guide/configuration/backlog' },
                { text: 'Templates', link: '/guide/configuration/templates' }
              ]
            }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Command Line', link: '/reference/command-line' },
            {
              text: 'Configuration', link: '/reference/configuration',
              items: [
                { text: 'API', link: '/' }
              ]
            }
          ]
        }
      ]
    },

    outline: {
      level: [2, 3]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/pedromsilvapt/ado-backlog' }
    ],

    search: {
      provider: 'local',
      options: {
        detailedView: true,
      }
    }
  },
  markdown: {
    languages: [ kdlLang ],
    codeTransformers: [
      transformerNotationWordHighlight({})
    ]
  }
})
