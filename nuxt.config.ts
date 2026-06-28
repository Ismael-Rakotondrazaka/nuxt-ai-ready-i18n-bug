// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  modules: ['nuxt-ai-ready', '@nuxtjs/sitemap', '@nuxtjs/i18n'],

  i18n: {
    defaultLocale: 'en',
    strategy: 'prefix',
    locales: [
      { code: 'en', language: 'en-GB' },
      { code: 'fr', language: 'fr-FR' },
    ],
  },

  aiReady: {
    runtimeSync: true,
    cron: true,
  },
});
