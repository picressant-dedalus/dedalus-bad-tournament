# Copilot Instructions

## Build

- Build: `npm run build` (bundles `src/main.ts` → `dist/main.js` via esbuild)
- Type-check: `npx tsc --noEmit`

## Service Worker Cache

This app is a PWA with a service worker (`sw.js`) that caches static assets.

**When you modify any of these files, you MUST bump the cache version in `sw.js`:**
- `index.html`
- `style.css`
- `dist/main.js` (i.e. any change in `src/`)

The cache version is on the first line of `sw.js`:
```js
const CACHE_NAME = 'bad-tournament-vN';
```
Increment the version number (e.g. `v3` → `v4`) so the updated service worker triggers a cache refresh for users.

**Do not forget this step** — without it, users will be served stale files from the old cache.
