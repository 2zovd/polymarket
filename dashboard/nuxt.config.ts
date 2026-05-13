export default defineNuxtConfig({
  modules: ['@nuxt/ui'],

  colorMode: {
    preference: 'dark',
  },

  ui: {
    icons: ['heroicons'],
  },

  devServer: {
    port: 3001,
    host: '127.0.0.1',
  },

  ssr: false,

  // Auto-import Vue components from FSD layers
  components: [
    { path: '~/src/widgets', pathPrefix: false, extensions: ['vue'] },
    { path: '~/src/features', pathPrefix: false, extensions: ['vue'] },
    { path: '~/src/entities', pathPrefix: false, extensions: ['vue'] },
    { path: '~/src/shared/ui', pathPrefix: false, extensions: ['vue'] },
  ],

  // Auto-import composables from FSD layers
  imports: {
    dirs: ['src/shared/lib', 'src/features/*/model', 'src/entities/*/model'],
  },

  nitro: {
    experimental: {
      asyncContext: true,
    },
  },

  compatibilityDate: '2024-11-01',
})
