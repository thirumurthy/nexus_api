# Scooter Sync & Fleet Insights API

Express + MongoDB (Mongoose) REST API with interactive Admin Dashboard, ready for Vercel.

## Structure
```
api/index.js              Vercel serverless entry
src/app.js                Express app
src/server.js             Local dev server
src/config/               env + cached Mongo connection
src/models/               Scooter, DailyUsage, SyncLog
src/controllers/          sync + read + admin endpoints
src/services/             insights calculations
src/middleware/           validation, API key, errors
src/routes/               route table
src/views/dashboard.html  Interactive Fleet Admin Dashboard
vercel.json               rewrites all traffic to the Express function
```

## Endpoints

### Public & Sync APIs
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Web redirect to `/admin` or API health status |
| GET | `/admin` or `/dashboard` | **Interactive Admin & Fleet Insights Web Dashboard** |
| GET | `/api/health` | Health check |
| POST | `/api/scooter/sync` | Upload odometer/SoC snapshot, returns insights |
| GET | `/api/scooter/:deviceId/insights` | Restore insights on a fresh install |
| GET | `/api/scooter/:deviceId/daily?from=&to=` | Day-by-day distance (bar chart) |
| GET | `/api/scooter/:deviceId/monthly?months=6` | Monthly comparison |

### Admin APIs
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/overview` | Fleet-wide analytics: total distance, petrol/CO2 savings, 14d travel trend, commute range distribution, popular riding modes |
| GET | `/api/admin/scooters?search=` | List and search all registered scooters by name, device ID, or app version |
| GET | `/api/admin/scooter/:deviceKey` | Specific scooter insights, battery health, 30d daily travel history, and raw sync logs |
| PATCH | `/api/admin/scooter/:deviceKey/name` | Assign or update friendly rider/scooter name (e.g. `{ "name": "Thiru's Ather" }`) |

`:deviceId` is URL-encoded (`4C%3A24%3A98%3AA1%3AB2%3AC3`).

## Run locally
```bash
npm install
cp .env.example .env   # fill MONGODB_URI, DEVICE_SALT
npm run dev
# Open http://localhost:3000/admin in your browser
```

## Deploy on Vercel
1. Push to GitHub, then **Add New > Project** on Vercel and import the repo.
2. Add env vars in Vercel Settings: `MONGODB_URI`, `DEVICE_SALT`, optional `API_KEY`, `TZ_OFFSET_MINUTES`.
3. In MongoDB Atlas > Network Access, allow `0.0.0.0/0` (Vercel IPs are dynamic).
4. Deploy and visit:
   - Dashboard: `https://<project>.vercel.app/admin`
   - Health check: `https://<project>.vercel.app/api/health`

## Notes
- **Identity:** a raw MAC is hashed server-side with `DEVICE_SALT` (SHA-256). If the app sends an already-hashed ID it is used as-is. Pick one scheme and keep it forever.
- **Idempotent:** retried syncs with the same `sync_timestamp` are not double counted.
- **Stale syncs:** an offline-queued sync older than the latest one is logged but does not rewind aggregates.
- **SoC consumed** is estimated from the drop between consecutive syncs while the odometer advanced; charging between rides can make it a slight underestimate.
- If `API_KEY` is set, send `x-api-key` on every `/api/scooter/*` and `/api/admin/*` call (the Admin Dashboard includes an API Key configuration dialog to set this in the UI).
