# Copilot Instructions

## Build

- Build: `npm run build` (bundles `src/main.ts` → `dist/main.js` via esbuild)
- Type-check: `npx tsc --noEmit`
- No test framework is configured.

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

## Architecture

The app is a **vanilla TypeScript PWA** (no framework) that manages a round-robin badminton tournament through a linear phase-based state machine:

```
players → teams → rounds → standings
```

Each phase corresponds to a UI section (`step-players`, `step-teams`, etc.) in `index.html`. Only one phase is visible at a time.

### Module responsibilities

| Module | Role |
|--------|------|
| `state.ts` | Defines `TournamentState` interface, localStorage serialization/deserialization |
| `tournament.ts` | Pure logic — team pairing, round-robin scheduling (circle method), score validation, standings computation with head-to-head tiebreakers |
| `ui.ts` | All DOM rendering and event handling; mutates the shared state object and calls the save callback |
| `main.ts` | Entry point — loads state, wires up reset functions on `window`, initializes UI |

### Data flow

1. `main.ts` loads state from localStorage and passes it (by reference) to `ui.ts`.
2. UI event handlers mutate the state object in place, then call `onStateChange()` to persist.
3. Phase transitions happen inside `ui.ts` by changing `state.phase` and re-rendering.
4. Global reset functions are exposed on `window` (`__resetTournament`, `__resetKeepPlayers`).

## Conventions

- **No framework** — direct DOM manipulation via `getElementById`, `innerHTML`, and `addEventListener`.
- **Imports use `.js` extensions** (e.g. `import { loadState } from './state.js'`) — required for browser-native ES module resolution even though source files are `.ts`.
- **Static site** — open `index.html` directly in a browser; no dev server needed.
- **TypeScript strict mode** — `"strict": true` in `tsconfig.json`; don't use `any` unless interfacing with `window`.
