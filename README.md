# 🥗 Diet & Calorie Logger

A web app to log what you eat each day and track calories and macros against a daily goal. It has a small **Node.js backend** (REST API with file-based storage) and a vanilla JS frontend. No dependencies, no build step.

**Live demo:** _add your deployed link here_

## Features

- Log foods by meal (Breakfast, Lunch, Dinner, Snack) with calories, protein, carbs and fat
- Progress ring for calories vs. your daily goal (turns orange when over)
- Editable daily goal, saved on the server
- Browse any date; last 7 days bar chart
- Export all entries as CSV
- Responsive on mobile
- If the API isn't reachable (for example on static hosting), the app automatically falls back to browser `localStorage`

## Project structure

```
server.js      Node HTTP server: REST API + static file serving (no dependencies)
public/        Frontend (index.html, style.css, app.js)
test.js        API tests (node test.js)
render.yaml    One-click deploy config for Render
data/db.json   Created at runtime; holds all entries (git-ignored)
```

## Run locally

Requires Node.js 18 or newer. There is nothing to install.

```bash
git clone https://github.com/<your-username>/diet-calorie-logger.git
cd diet-calorie-logger
npm start
# open http://localhost:3000
```

Run the tests:

```bash
npm test
```

Environment variables (all optional): `PORT` (default 3000), `DATA_FILE` (default `data/db.json`).

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/state` | Goal and all days |
| PUT | `/api/goal` | Body `{ "goal": 2000 }` (500–10000) |
| GET | `/api/days/:date` | Entries for a date (`YYYY-MM-DD`) |
| POST | `/api/days/:date/entries` | Body `{ name, meal, cal, p, c, f }`, returns the created entry |
| DELETE | `/api/days/:date/entries/:id` | Delete one entry |
| DELETE | `/api/days/:date` | Clear a day |

Example:

```bash
curl -X POST localhost:3000/api/days/2026-10-27/entries \
  -H "Content-Type: application/json" \
  -d '{"name":"Oats","meal":"Breakfast","cal":300,"p":10,"c":50,"f":5}'
```

## Deploy for free

### Render (runs the backend)
1. Push the repo to GitHub.
2. On [render.com](https://render.com), choose **New → Blueprint** (or **Web Service**) and select the repo. `render.yaml` sets everything up: start command `node server.js`, free plan, health check `/api/health`.
3. When the deploy finishes, open the `*.onrender.com` URL.

Note: free instances sleep after inactivity (the first request is slow) and have an ephemeral disk, so saved data can reset on redeploy or restart. For permanent storage, move `data/db.json` to a managed database or a persistent disk. Use **Export CSV** for backups.

### GitHub Pages (frontend only)
The `public/` folder also works as a static site, in which case the app uses browser storage instead of the API. Set Pages to deploy from a branch and use the `/public` content (or copy it to a `docs/` folder and select `/docs`).

## License

MIT
