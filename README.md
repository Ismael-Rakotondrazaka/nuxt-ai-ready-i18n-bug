# nuxt-ai-ready i18n bug reproduction

Minimal reproduction for: **`runtimeSync` indexes 0 pages when `@nuxtjs/i18n` is active**

## Bug report

Filed against: `nuxt-ai-ready` + `@nuxtjs/sitemap`

**Packages:**

| Package | Version |
|---------|---------|
| `nuxt-ai-ready` | 1.5.2 |
| `@nuxtjs/sitemap` | 8.2.2 |
| `@nuxtjs/i18n` | 9.x |

## Steps to reproduce

> **Note:** StackBlitz is not viable — `better-sqlite3` is a native Node.js addon
> incompatible with WebContainers. Run locally instead.

```bash
npm install
npm run build && npm run preview
```

Then verify the symptoms:

```bash
# Expect: 307 redirect — XML never served directly at /sitemap.xml
curl -I http://localhost:3000/sitemap.xml

# Expect: 0 pages despite the app running
npx nuxt-ai-ready status
```

## Expected behaviour

Pages are indexed after the cron task runs (`runtimeSync: true, cron: true`).

## Actual behaviour

```
WARN [sitemap] Failed to parse /sitemap.xml: XML does not contain a valid urlset element
```

```
Total pages: 0 / Indexed: 0 / Pending: 0
```

## Root cause

Two chained incompatibilities:

1. **`getSitemapsFromConfig` always returns `[]`** — `nuxt-ai-ready` reads
   `runtimeConfig.sitemap.sitemaps` to detect multi-sitemap mode, but `@nuxtjs/sitemap`
   stores its config in a Nitro virtual module (`#sitemap-virtual/static-config.mjs`),
   not in `runtimeConfig`. Only `{ cacheMaxAgeSeconds, debug }` ends up in
   `runtimeConfig.sitemap`, so multi-sitemap mode never activates.

2. **`/sitemap.xml` redirects (307) instead of serving XML** — when `@nuxtjs/i18n` is
   active, `@nuxtjs/sitemap` always creates per-locale sitemaps regardless of whether
   named `sitemaps` or a single `sources` config is used. This sets `isMultiSitemap = true`
   and adds a Nitro route rule `{ "/sitemap.xml": { redirect: "/sitemap_index.xml" } }`.
   `nuxt-ai-ready`'s internal `event.$fetch('/sitemap.xml')` either does not follow the
   307 in Nitro's internal fetch context, or `isSitemapIndex` fails on the response.

## Suggested fix

Either:

- Have `nuxt-ai-ready` read the sitemaps config from the virtual module
  (`#sitemap-virtual/static-config.mjs`) instead of `runtimeConfig`, enabling it to fetch
  locale sitemaps directly without going through `/sitemap.xml`.
- Or follow the redirect chain `/sitemap.xml` → `/sitemap_index.xml` → locale children
  and handle the sitemapindex XML format correctly.
