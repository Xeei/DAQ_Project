# Munyin Backend API Design

## Goal

Read-only Express REST API serving sensor dashboard data from MySQL to the React frontend.

## Architecture

Node.js + Express with MVC structure. Models hold raw SQL queries executed via mysql2 connection pool. Controllers call models and shape HTTP responses. No auth — public read-only API. Computed fields (VPD, IUI, scores) are calculated in SQL, not application code.

## Tech Stack

- Runtime: Node.js
- Package manager: pnpm
- Framework: Express
- Database: MySQL via mysql2
- Config: dotenv
- Dev: nodemon

---

## File Structure

```
backend/
  src/
    config/
      db.js               # mysql2 createPool(), reads process.env
    models/
      sensorModel.js      # getLatest(), getHistory(hours), getStatus()
    controllers/
      dataController.js   # Express req/res handlers
    routes/
      api.js              # Router mounted at /api
    app.js                # Express setup: CORS, JSON, routes
  index.js                # Entry: app.listen(PORT)
  .env                    # Gitignored — DB credentials + PORT
  .env.example            # Committed template
  package.json
```

---

## Database

Three tables in MySQL:

- `munyin_sensors` — columns: `ts`, `temperature`, `humidity`, `soil_moisture`, `soil_raw`
- `munyin_tmd` — columns: `ts`, `AirTemperature`, `DewPoint`, `RelativeHumidity`, `Rainfall24Hr`
- `munyin_aqi` — columns: `ts`, `aqi`, `pm25`, `pm10`

All computed fields (VPD, soil_score, vpd_score, rain_factor, aqi_factor, IUI) are calculated in SQL.

---

## API Endpoints

### GET /api/latest

Returns the most recent joined reading across all three tables.

**Response:**
```json
{
  "ts": "2026-04-06 14:40:55",
  "sensor": {
    "temperature": 28,
    "humidity": 80,
    "soil_moisture": 54.2,
    "soil_raw": 1877
  },
  "weather": {
    "air_temperature": 35.2,
    "dew_point": 24.3,
    "humidity": 53,
    "rainfall_24hr": 0
  },
  "aqi": {
    "aqi": 69,
    "pm25": 69,
    "pm10": 20
  },
  "computed": {
    "vpd": 0.756,
    "soil_score": 0.458,
    "vpd_score": 0.252,
    "rain_factor": 0.11,
    "aqi_factor": 0.345,
    "iui": 0.027
  }
}
```

### GET /api/history?hours=N

Returns time-series sensor readings for last N hours. `hours` defaults to 24 if omitted. Must be a positive integer (validated in controller; invalid value returns 400).

**Response:**
```json
{
  "data": [
    {
      "ts": "2026-04-06 00:00:00",
      "temperature": 26.5,
      "humidity": 72.1,
      "soil_moisture": 52.3,
      "vpd": 0.45,
      "iui": 0.12
    }
  ]
}
```

### GET /api/status

Checks freshness of each data source. Sensor: stale if no data in last 20 minutes. TMD and AQI: stale if no data in last 2 hours.

**Response:**
```json
{
  "sensor": "ok",
  "tmd": "ok",
  "aqi": "ok"
}
```

Values are `"ok"` or `"error"`.

---

## Environment Variables (.env)

```
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=
```

---

## Error Handling

- DB connection failure → 500 with `{ error: "Database error" }`
- Invalid `hours` param (non-integer, ≤0) → 400 with `{ error: "Invalid hours parameter" }`
- No rows returned from latest → 404 with `{ error: "No data available" }`

---

## CORS

Enable for all origins (frontend dev and prod both need access). Configure via `cors` middleware in `app.js`.
