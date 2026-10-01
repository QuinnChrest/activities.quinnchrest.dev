# activities.quinnchrest.dev

A small static site with every bike ride and walk on one glowing map, plus a
highlights page with totals, records and a year calendar. There's no backend:
the site reads a single generated file, `public/data/activities.json`.

- **Map** (`#/`): all routes as semi-transparent lines on a dark basemap, so
  frequently traveled roads glow brighter. Filter by type and year. Hover to
  preview a route; where routes overlap you get an "N activities here" list
  (click to pin it). Click a route to open it on Strava. On touch devices, tap a
  route to open a bottom sheet, then tap the card.
- **Highlights** (`#/highlights`): lifetime totals, distance per year and per month,
  records, fun equivalents, and a GitHub-style calendar. Miles/feet by default,
  with a km toggle.

Stack: React + Vite + TypeScript, [MapLibre GL JS](https://maplibre.org/), and
[OpenFreeMap](https://openfreemap.org/)'s free "dark" style (no API key). The
charts are hand-written HTML/CSS, with no charting library.

## Setup

```bash
npm install
npm run data:sample   # fake activities around Monticello, MN
npm run dev
```

## Importing your Strava export

1. On Strava go to **Settings → My Account → Download or Delete Your Account →
   Request your archive**. You'll get a zip by email.
2. Unzip it into `export/` in this repo (it's gitignored). It should contain
   `activities.csv` and an `activities/` folder of `.gpx`, `.tcx` and `.fit`
   files (often `.gz`).
3. (Recommended) set up privacy zones. See below.
4. Run:

   ```bash
   npm run data:import -- export
   ```

   This replaces `public/data/activities.json`. Add `--merge` to keep existing
   activities and add or replace by id.

Bike types (Ride, Gravel, Mountain Bike, E-Bike…) map to **bike**. Walk and
Hike map to **walk**. Everything else is skipped: runs, virtual rides, and
manual activities with no GPS file. The importer prints a summary of what it
skipped and why.

Distance, moving time, elevation gain and average speed come from
`activities.csv` (the SI columns: the export repeats some headers in display
units). Routes come from the GPS files. Activities recorded on a Garmin device
are flagged from the FIT manufacturer field or the GPX/TCX creator, so the
site can show Garmin attribution.

## Privacy

Everything published is in `public/data/activities.json`, and nothing else from
the export ever leaves your machine. Before any route is written, the pipeline
(`scripts/lib/privacy.ts`):

1. **Removes every point inside a privacy zone.** A track that passes through a
   zone is split into separate segments, so no line is drawn across it.
2. **Trims the start and end** of every activity until the track is at least
   `trimMeters` (default 300 m) from where it began and ended, measured in a
   straight line. Straight-line distance never exceeds distance along the path,
   so this always trims at least 300 m of path, even for tracks that wind around
   near home first.
3. **Simplifies the track** (Douglas–Peucker, ~6 m tolerance) and rounds
   coordinates to 5 decimals (~1 m).

Configure zones in `privacy.config.json` (gitignored). Copy the example to start:

```bash
cp privacy.config.example.json privacy.config.json
```

```json
{
  "trimMeters": 300,
  "zones": [{ "name": "home", "lat": 45.2935, "lng": -93.7881, "radius": 400 }]
}
```

Tips:

- Don't center a zone exactly on your house. Offset it a bit and use a
  radius of 300–500 m, so the center of the gap doesn't point at your door.
- For CI, put the same JSON in a `PRIVACY_CONFIG` environment variable or
  secret. It takes precedence over the file.
- Zone names are never published. Only the processed routes are.

## Configuration

`src/site.config.ts` holds the site name, tagline, colors, time zone (used to
bucket activities into local days) and the minimum distance for the
"fastest ride" record. The site name is only set there, so rename freely.

## Deploying (GitHub Pages)

`.github/workflows/deploy.yml` builds and deploys on every push to `main`.

1. In the repo on GitHub: **Settings → Pages → Build and deployment → Source:
   GitHub Actions**.
2. Custom domain: add a DNS `CNAME` record `activities` →
   `quinnchrest.github.io`. Then set the domain under **Settings → Pages →
   Custom domain** and turn on **Enforce HTTPS** once the certificate is issued.
   `public/CNAME` is included for reference.
3. Without a custom domain (served from `https://<user>.github.io/<repo>/`),
   build with `VITE_BASE=/<repo>/`.

The committed `public/data/activities.json` is what gets deployed. The weekly sync
(below) keeps it current; you can also re-run the import and commit the file.

Cloudflare Pages also works: build command `npm run build`, output directory
`dist`.

## Weekly sync from the Strava API

`.github/workflows/sync-strava.yml` runs every Monday (and on demand from the
Actions tab). It fetches the last 7 days of activities, runs them through the
same pipeline as the export import, merges them into `activities.json` by id,
pushes to `main` if anything changed, and starts the deploy.

```
source (export | sample | api) → privacy → simplify → encode → merge by id → activities.json
```

The existing JSON is already privacy-processed, so CI never needs the raw
history. Re-fetching a week that's already in the file is harmless and picks up
renamed or edited activities.

### One-time setup

1. Create an app at <https://www.strava.com/settings/api> with
   **Authorization Callback Domain** set to `localhost`.
2. Add repo secrets (Settings → Secrets and variables → Actions):
   `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, and `PRIVACY_CONFIG` (the
   contents of `privacy.config.json`). From PowerShell:
   `Get-Content privacy.config.json -Raw | gh secret set PRIVACY_CONFIG`.
3. Put `STRAVA_CLIENT_ID=…` and `STRAVA_CLIENT_SECRET=…` in `.env` (gitignored).
4. Run `npm run strava:auth`. It opens Strava, asks for the
   `activity:read_all` scope, and stores the resulting refresh token as the
   `STRAVA_REFRESH_TOKEN` secret via `gh`, without printing it. Add `-- --env`
   to also save it to `.env` for local runs.

The refresh token shown on Strava's API settings page only has the `read`
scope and can't list activities, so use the one from `strava:auth`. If the
sync ever fails with a token error, run `strava:auth` again.

To sync locally (with all four values in `.env` or `privacy.config.json`):
`npm run data:sync -- --days 30`.

## Attribution

- The map attribution (OpenFreeMap © OpenMapTiles, data © OpenStreetMap
  contributors) comes from the style and is shown by MapLibre.
- The footer shows "Powered by Strava" and "Personal project, not affiliated
  with Strava". Garmin attribution appears only when Garmin-recorded
  activities are present, and each Garmin activity's card is labeled.
- Activity links read "View on Strava" and are bold and underlined, per
  Strava's brand guidelines. Strava's orange and logo aren't used for site
  branding.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck and production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run data:sample -- [--seed 42]` | Generate sample data |
| `npm run data:import -- <dir> [--merge]` | Import a Strava bulk export |
| `npm run data:sync -- [--days 7]` | Merge recent activities from the Strava API |
| `npm run strava:auth -- [--env]` | One-time OAuth; stores the refresh token as a GitHub secret |
