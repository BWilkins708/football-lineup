# Soccer Line-up & Stats

A phone-first web app for coaches to build line-ups, track matches live from the sideline and keep season stats for every player. It installs to the home screen like a native app and works fully offline.

## Features

- **Squad**: players with shirt number, positions, strong foot and notes
- **Line-ups**: 8 formations (4-4-2, 4-3-3, 4-2-3-1, 4-1-4-1, 3-5-2, 3-4-3, 5-3-2, 5-4-1), tap-to-pick positions, captain, bench, auto-fill, saved line-ups
- **Live match**: match clock with halves, goals with assists and penalties, shots, cards (second yellow becomes a red), injuries, substitutions, undo, live minutes played
- **Reports and stats**: match report, results record, per-player season stats and match log, sortable season table
- **Backup**: data lives on the device (IndexedDB); download and restore a JSON backup

## Use it

Open **https://bwilkins708.github.io/football-lineup/** on your phone, then use "Add to Home Screen" (Safari share menu on iPhone, or the browser menu on Android) to install it. Every push to `main` redeploys automatically.

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # type-check and production build to dist/
npm run preview  # serve the production build
```

Built with React, TypeScript, Vite, Dexie (IndexedDB) and vite-plugin-pwa. The build uses relative paths and hash routing, so `dist/` can be hosted on any static host (GitHub Pages, Netlify, Vercel).
