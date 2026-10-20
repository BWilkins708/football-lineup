# Soccer Line-up & Stats

A phone-first web app for coaches to build line-ups, record results and keep goals and assists for every player. It installs to the home screen like a native app and works fully offline.

## Features

- **Teams**: keep several teams, each with its own squad, line-ups, results and stats; switch between them from the top bar
- **Squad**: players with shirt number, positions, strong foot and notes; paste a whole squad list at once
- **Line-ups**: 5, 6, 7, 9 and 11-a-side with formations for each, tap-to-pick positions, captain, bench, auto-fill, saved line-ups; share a line-up as a picture
- **Results**: record each game's score, who played, who scored and who assisted; fill "who played" from a line-up
- **Seasons**: results and stats show one season at a time (start month set per team), or all seasons
- **Stats**: record, clean sheets, top scorer and assists, per-player games, goals, assists and clean sheets, record against each opponent; export player stats and results as CSV
- **Backup**: data lives on the device (IndexedDB). Settings has one-tap backup (share sheet or download) and a reminder when there are changes that haven't been backed up. Restoring lets you pick which teams to bring back and keeps the others, or replace everything

## Use it

Open **https://bwilkins708.github.io/football-lineup/** on your phone, then use "Add to Home Screen" (Safari share menu on iPhone, or the browser menu on Android) to install it. Every push to `main` redeploys automatically.

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # unit tests (Vitest)
npm run build    # type-check and production build to dist/
npm run preview  # serve the production build
```

Built with React, TypeScript, Vite, Dexie (IndexedDB) and vite-plugin-pwa. The build uses relative paths and hash routing, so `dist/` can be hosted on any static host (GitHub Pages, Netlify, Vercel).
