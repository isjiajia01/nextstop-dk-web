# Live backend

The repository includes a small Node TypeScript backend in `server/`. It keeps the Rejseplanen access ID in the server process and exposes only normalized JSON to a browser or another local client:

- `GET /health` reports whether credentials are configured and the durable monthly call count.
- `GET /api/stops/search?q=...&lat=...&lng=...` calls `location.name` and returns normalized stops with distance.
- `GET /api/stops/nearby?lat=...&lng=...&radiusM=...` and `GET /api/stops/nearest?lat=...&lng=...` call `location.nearbystops`.
- `GET /api/board?stopId=...` calls `departureBoard` and returns the web app's `Board` shape.

Start it with `npm run server`. It binds to `127.0.0.1:8787` by default; set `PORT` to change the port. The backend is intentionally separate from the fixture demo, so the existing frontend continues to show synthetic data until a deliberate client wiring change is made.

## Configuration

All configuration is read from environment variables. There is no keychain, checked-in `.env` file, or browser credential path.

| Variable | Default | Purpose |
| --- | --- | --- |
| `REJSEPLANEN_ACCESS_ID` | none | Required upstream credential. The server returns a clear unconfigured error when absent. |
| `REJSEPLANEN_BASE_URL` | `https://www.rejseplanen.dk/api` | Upstream base URL; tests use a fake transport instead. |
| `REJSEPLANEN_CACHE_PATH` | `.data/rejseplanen-cache.json` | Persistent cache and budget state. Keep this outside source control. |
| `REJSEPLANEN_MONTHLY_CALL_LIMIT` | `50000` | Hard monthly limit. Every actual upstream attempt, including retries, consumes one call. |
| `REJSEPLANEN_MIN_INTERVAL_MS` | `250` | Minimum spacing between upstream attempts in one process. |
| `REJSEPLANEN_TIMEOUT_MS` | `5000` | Per-attempt timeout. |
| `REJSEPLANEN_MAX_RETRIES` | `2` | Retries for network errors, HTTP 429, and HTTP 5xx responses. |
| `REJSEPLANEN_STALE_MAX_AGE_MS` | `21600000` | Maximum age for stale fallback (six hours). |
| `REJSEPLANEN_FRESH_MS` | `120000` | Fresh-serve window (two minutes), capped at half of the stale lifetime. |

The cache file is updated under an exclusive lock file and written through a synced temporary file followed by rename and directory sync. Processes sharing the same local filesystem path reserve budget slots atomically. The budget resets on the UTC calendar month. A process killed while holding the lock leaves a lock file and subsequent writes fail closed; after confirming no backend process holds the lock, an operator must remove it. Do not delete or roll back the budget file during a month. Fresh entries are served for up to two minutes (`REJSEPLANEN_FRESH_MS`) (or half the configured stale lifetime, whichever is shorter). A bounded stale response may be returned when refresh fails or the budget is exhausted. If no usable cache entry exists, budget exhaustion returns `429`. Board responses preserve the original fetch time in `fetchedAt`.

## API assumptions and limits

The local read-only reference project uses these Rejseplanen API 2.0 endpoints and fields, which are the only upstream schemas normalized here:

- `location.name?input=...&format=json&accessId=...`; candidates are read from `LocationList.StopLocation`, `LocationList.CoordLocation`, or the wrapped `stopLocationOrCoordLocation` entries. `id`, `name`, `lat`, and `lon` are required.
- `departureBoard?id=...&format=json&accessId=...`; departures are read from `DepartureBoard.Departure` or top-level `Departure`. `line`/`name`, `direction`, `date`, `time`, and optional `rtDate`/`rtTime` are used.
- Rejseplanen local date/time values are interpreted in `Europe/Copenhagen`.

Cancellation and journey-detail identifiers are not documented by the local reference, so cancellations are not reported and a local stop/line/time identifier is generated. If a board lacks stop coordinates, the required `Board.stop` coordinates default to zero; clients needing a map location should use a location lookup instead. Invalid or ambiguous Copenhagen wall times are omitted rather than guessed.

The reference project at `~/Developer/archive/icloud-life-os-old-20261031/10-19 Personal/11.00 Projects/11.14_afgang` was inspected read-only. Its `docs/realtime-route-audit.md` documents `location.nearbystops` parameters `originCoordLat`, `originCoordLong`, and `r`; this adapter assumes the location response wrappers match `location.name`. The reference does not document stop-ID lookup, a journey-detail response, or a service-alert endpoint, so those repository methods fail explicitly. Tests and startup do not call Rejseplanen.

Responses and errors never include the constructed upstream URL, so the access ID is not written to logs or returned to clients.
