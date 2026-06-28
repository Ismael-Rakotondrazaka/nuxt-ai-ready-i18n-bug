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

### 1. `getSitemapsFromConfig` always returns `[]`

`nuxt-ai-ready` `runtime/server/utils/sitemap.js:7-23` reads
`runtimeConfig.sitemap.sitemaps` to detect multi-sitemap mode:

```js
export function getSitemapsFromConfig(event) {
  const runtimeConfig = useRuntimeConfig(event);
  const sitemapConfig = runtimeConfig.sitemap;
  if (!sitemapConfig?.sitemaps)  // always true
    return [];
```

However `@nuxtjs/sitemap` `module.mjs:1077-1085` deliberately splits its config:

```js
const dynamicRuntimeConfig = {
  cacheMaxAgeSeconds: runtimeConfig.cacheMaxAgeSeconds,
  debug: runtimeConfig.debug,
  // sitemaps intentionally excluded
};
nuxt.options.runtimeConfig.sitemap = dynamicRuntimeConfig;              // line 1082
nitroConfig.virtual["#sitemap-virtual/static-config.mjs"] =
  `export default ${JSON.stringify(staticRuntimeConfig)}`;              // line 1085
```

The full config (including `sitemaps`) goes into the virtual module. Only
`{ cacheMaxAgeSeconds, debug }` ends up in `runtimeConfig.sitemap`, so
`getSitemapsFromConfig()` always returns `[]` and multi-sitemap mode never activates.

### 2. `event.$fetch('/sitemap.xml')` returns HTML, not XML

When `@nuxtjs/i18n` is active, `@nuxtjs/sitemap` `module.mjs:750-751` registers a Nitro
route rule regardless of whether you use named `sitemaps` or a flat `sources` config:

```js
if (usingMultiSitemaps) {
  nuxt.options.nitro.routeRules["/sitemap.xml"] = { redirect: "/sitemap_index.xml" };
```

Since root cause #1 fires first, `nuxt-ai-ready` falls to single-sitemap mode and calls
`event.$fetch('/sitemap.xml', { responseType: "text" })` (`sitemap.js:55`). Nitro's
internal `event.$fetch` resolves route rules without going through the HTTP stack. When it
hits the redirect rule, it returns the HTML redirect response body rather than following
the 307 to `/sitemap_index.xml`. As a result, `isSitemapIndex(sitemapXml)` at `sitemap.js:71`
returns `false` (the content is HTML, not sitemap XML), and `parseSitemapXml` throws:

```
XML does not contain a valid urlset element
```

Note: `fetchSitemapByRoute` already handles the sitemapindex XML format correctly
(`sitemap.js:71-101`) — if it ever received actual XML from `/sitemap_index.xml`, it
would recursively fetch all locale child sitemaps. The redirect simply prevents that.

## Suggested fix

Two independent options, either of which would resolve the issue:

**Option A** — in `getSitemapsFromConfig` (`sitemap.js:7-23`), import
`#sitemap-virtual/static-config.mjs` instead of reading `runtimeConfig.sitemap`. This
gives access to the full config including `sitemaps`, enabling multi-sitemap mode and
bypassing the `/sitemap.xml` redirect entirely.

**Option B** — in `module.mjs:756-757`, `nuxt-ai-ready` already reads the route rule at
build time:

```js
const sitemapRouteRule = nuxt.options.nitro?.routeRules?.["/sitemap.xml"];
```

It currently only checks `sitemapRouteRule?.prerender`. It could also check
`sitemapRouteRule?.redirect`: if a redirect target exists, store it in `runtimeConfig` so
that `fetchSitemapUrls` fetches the redirect target directly instead of `/sitemap.xml`.
