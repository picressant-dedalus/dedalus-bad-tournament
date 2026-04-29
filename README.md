# 🏸 Dedalus Badminton Tournament

A lightweight PWA to manage round-robin badminton tournaments for 12 players (6 teams of 2).

## Features

- **Player entry** — enter 12 player names manually or import them from a Google Spreadsheet tab
- **Team generation** — randomly pair players into 6 teams, with drag-to-swap for manual adjustments
- **Round-robin scheduling** — automatic 5-round schedule where every team plays every other team
- **Score tracking** — enter and validate match scores (≥21 pts, 2-point lead), with the ability to edit scores after validation
- **Live standings** — final rankings with win/loss record, point differential, and head-to-head tiebreakers
- **New tournament** — restart with the same players without re-entering names
- **Offline support** — works offline as an installable PWA

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)

### Install & Build

```bash
npm install
npm run build
```

### Run

Open `index.html` in a browser. No dev server required — it's a static site.

### Type-check

```bash
npx tsc --noEmit
```

## Project Structure

```
src/
  main.ts        — app entry point, state management
  state.ts       — tournament state, localStorage persistence
  tournament.ts  — game logic (pairing, scheduling, scoring, standings)
  ui.ts          — DOM rendering and event handling
index.html       — single-page HTML shell
style.css        — responsive styles
sw.js            — service worker for offline caching
```

## Service Worker

The app uses a service worker (`sw.js`) with a versioned cache. **When modifying `index.html`, `style.css`, or any source file**, bump the cache version on the first line of `sw.js`:

```js
const CACHE_NAME = 'bad-tournament-vN'; // increment N
```
