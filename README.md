# Weekly Meal Board

A shareable meal-planning webpage with:

- separate HTML, CSS, and JavaScript files
- a SQLite database that stores the two-week meal schedule
- day-level editing plus suggestions for breakfast, lunch, and dinner entries

## Run it

```bash
node server.js
```

Then open `http://localhost:3000`.

## Update the running server

On a Raspberry Pi or any other Linux host, you can update the app with one command from inside the repo:

```bash
./scripts/update.sh
```

That script does two things:

1. pulls the latest changes from `origin/main`
2. restarts the app if it is managed by a systemd service named `weekly-meal-board.service`

If you use a different service name, set `SERVICE_NAME` when you run the script:

```bash
SERVICE_NAME=meal-board.service ./scripts/update.sh
```

If the repo is running under Docker Compose instead, the script will rebuild and restart the stack when it sees a Compose file.

## Data

The database is created automatically at `data/menu.db`.

The first run imports the two-week schedule and organizes it into:

- Week 1: June 1, 2026 through June 7, 2026
- Week 2: June 8, 2026 through June 14, 2026

## Notes

- Prices have been removed from the app and from the stored schedule model.
- Users can suggest updates for individual breakfast, lunch, or dinner entries.
- Editors can update a whole day directly from the sidebar form.

## Put it online with Render

This repo now includes a `render.yaml` blueprint and `Dockerfile` for Render.

1. Push this repo to GitHub, GitLab, or Bitbucket.
2. In Render, create a new Blueprint from the repo root.
3. Use the generated web service URL to share the page publicly.
4. Keep the attached disk mounted at `/app/data` so the SQLite database persists between deploys.

Render web services need to bind to `0.0.0.0`. This app already does that, and Render provides the `PORT` environment variable automatically.
