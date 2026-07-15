# Benchpress v2

Personal workout tracker. Local-first PWA: all data in IndexedDB, fully offline, no server.

## Commands

```bash
npm run dev          # dev server (supports ?today=YYYY-MM-DD override for rollover testing)
npm test             # 88 unit tests (runs under TZ=America/New_York to exercise DST)
npm run build        # tsc + vite build + service worker
npm run preview      # serve the production build
npm run build-seed   # regenerate src/seed/seed.json from fixtures/mesocycle_9.csv
npm run gen-icons    # regenerate public/icon-*.png
```

Note: in this machine's shell, npm installs need `env -u npm_config_allow_scripts -u npm_config_local_prefix npm install`.

## How it works

- **Week documents**: one IndexedDB record per week (`id` = local Monday `YYYY-MM-DD`), containing 7 days → ordered exercises. All mutations are targeted read-modify-write transactions in `src/db/repo.ts`.
- **Progression** (`src/domain/progression.ts`): an exercise shows "↑ progress" when last week's same-named exercise hit the TOP of its parsed rep range on every prescribed set. Matching is one-to-one: `sourceId` lineage first (rename → no badge by design), then same-day name, then week-unique name. Weights are never predicted.
- **Targets** (`src/domain/target.ts`): parsed from the free-text description ("4 sets × 5–8 reps", superset sums, fixed reps). Unparseable → progression-ineligible.
- **Rollover** (`src/domain/rollover.ts`): on first open on/after Sunday, the latest week is deep-copied into the new week (plan edits carry forward automatically). Multi-week gaps → single jump; meso/week numbers count *trained* weeks. 4 weeks = 1 mesocycle.
- **Seed**: Mesocycle 9 from the Google Sheet, committed as `src/seed/seed.json` (regenerate via `build-seed` after updating the CSV fixture).
- **Backup**: Settings → Export JSON. That file is the real backup — IndexedDB can be evicted by the browser. Import validates structurally and auto-downloads a pre-import backup.
