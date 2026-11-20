# Scooter Sync API

Express + MongoDB (Mongoose) REST API, ready for Vercel.

## Structure
```
api/index.js              Vercel serverless entry
src/app.js                Express app
src/server.js             Local dev server
src/config/               env + cached Mongo connection
src/models/               Scooter, DailyUsage, SyncLog
src/controllers/          sync + read endpoints
src/services/             insights calculations
src/middleware/           validation, API key, errors
src/routes/               route table
vercel.json               rewrites all traffic to the Express function
```

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/scooter/sync` | Upload odometer/SoC snapshot, returns insights |
| GET | `/api/scooter/:deviceId/insights` | Restore insights on a fresh install |
| GET | `/api/scooter/:deviceId/daily?from=&to=` | Day-by-day distance (bar chart) |
| GET | `/api/scooter/:deviceId/monthly?months=6` | Monthly comparison |

`:deviceId` is URL-encoded (`4C%3A24%3A98%3AA1%3AB2%3AC3`).

## Run locally
```bash
npm install
cp .env.example .env   # fill MONGODB_URI, DEVICE_SALT
npm run dev
```

## Deploy on Vercel
1. Push to GitHub, then **Add New > Project** on Vercel and import the repo (no build settings needed).
2. Add env vars: `MONGODB_URI`, `DEVICE_SALT`, optional `API_KEY`, `TZ_OFFSET_MINUTES`.
3. In MongoDB Atlas > Network Access, allow `0.0.0.0/0` (Vercel IPs are dynamic).
4. Deploy, then test `https://<project>.vercel.app/api/health`.

## Notes
- **Identity:** a raw MAC is hashed server-side with `DEVICE_SALT` (SHA-256). If the app sends an already-hashed ID it is used as-is. Pick one scheme and keep it forever.
- **Idempotent:** retried syncs with the same `sync_timestamp` are not double counted.
- **Stale syncs:** an offline-queued sync older than the latest one is logged but does not rewind aggregates.
- **SoC consumed** is estimated from the drop between consecutive syncs while the odometer advanced; charging between rides can make it a slight underestimate.
- If `API_KEY` is set, send `x-api-key` on every `/api/scooter/*` call.
