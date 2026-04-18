# Munyin Backend API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only Express REST API that serves MySQL sensor data to the Munyin React dashboard.

**Architecture:** MVC structure — `sensorModel.js` holds raw SQL queries via mysql2 pool, `dataController.js` shapes HTTP responses, `routes/api.js` wires them to Express. Three endpoints: `/api/latest`, `/api/history`, `/api/status`. No auth. Computed fields (VPD, IUI) calculated in SQL.

**Tech Stack:** Node.js, pnpm, Express 4, mysql2, dotenv, cors, Jest + Supertest (tests)

---

## File Map

| File | Purpose |
|------|---------|
| `index.js` | Entry point — loads dotenv, starts server |
| `src/app.js` | Express app — CORS, JSON, mounts `/api` router |
| `src/config/db.js` | mysql2 connection pool |
| `src/models/sensorModel.js` | `getLatest()`, `getHistory(hours)`, `getStatus()` |
| `src/controllers/dataController.js` | `latest()`, `history()`, `status()` handlers |
| `src/routes/api.js` | Router: GET /latest, /history, /status |
| `tests/api.test.js` | Supertest tests for all endpoints (mocks sensorModel) |
| `.env` | Gitignored — DB creds + PORT |
| `.env.example` | Committed template |
| `.gitignore` | node_modules, .env |

---

## Task 1: Project Init

**Files:**
- Create: `backend/package.json`
- Create: `backend/.gitignore`
- Create: `backend/.env.example`

- [ ] **Step 1: Initialize pnpm project**

```bash
cd /Users/earth/KU/year2/2-2/DAQ/project/backend
pnpm init
```

Expected: `package.json` created.

- [ ] **Step 2: Install runtime dependencies**

```bash
pnpm add express mysql2 dotenv cors
```

Expected: `node_modules/` created, dependencies in `package.json`.

- [ ] **Step 3: Install dev dependencies**

```bash
pnpm add -D jest supertest nodemon
```

- [ ] **Step 4: Update package.json scripts**

Open `package.json` and replace the `"scripts"` section with:

```json
"scripts": {
  "start": "node index.js",
  "dev": "nodemon index.js",
  "test": "jest"
}
```

- [ ] **Step 5: Create .gitignore**

Create `backend/.gitignore`:

```
node_modules/
.env
```

- [ ] **Step 6: Create .env.example**

Create `backend/.env.example`:

```
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=
```

- [ ] **Step 7: Copy .env.example to .env and fill in real values**

```bash
cp .env.example .env
```

Then open `.env` and set your actual MySQL credentials.

- [ ] **Step 8: Create source directories**

```bash
mkdir -p src/config src/models src/controllers src/routes tests
```

- [ ] **Step 9: Commit**

```bash
git add package.json .gitignore .env.example
git commit -m "chore: init pnpm project with dependencies"
```

---

## Task 2: DB Config

**Files:**
- Create: `backend/src/config/db.js`

- [ ] **Step 1: Create db.js**

Create `backend/src/config/db.js`:

```js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
```

Note: `dotenv` is loaded in `index.js` (Task 5) before any `require` calls, so `process.env` values are available here at runtime.

- [ ] **Step 2: Commit**

```bash
git add src/config/db.js
git commit -m "feat: add mysql2 connection pool"
```

---

## Task 3: Sensor Model

**Files:**
- Create: `backend/src/models/sensorModel.js`

- [ ] **Step 1: Create sensorModel.js**

Create `backend/src/models/sensorModel.js`:

```js
const pool = require('../config/db');

async function getLatest() {
  const [rows] = await pool.query(`
    SELECT
      s.ts,
      s.temperature,
      s.humidity,
      s.soil_moisture,
      s.soil_raw,
      w.AirTemperature                                              AS air_temperature,
      w.DewPoint                                                    AS dew_point,
      w.RelativeHumidity                                            AS weather_humidity,
      w.Rainfall24Hr                                                AS rainfall_24hr,
      a.aqi,
      a.pm25,
      a.pm10,
      ROUND(
        0.6108 * EXP((17.27 * s.temperature) / (s.temperature + 237.3))
        * (1 - s.humidity / 100.0)
      , 3)                                                          AS vpd,
      ROUND(1.0 - (s.soil_moisture / 100.0), 3)                    AS soil_score,
      ROUND(LEAST(1.0,
        (0.6108 * EXP((17.27 * s.temperature) / (s.temperature + 237.3))
        * (1 - s.humidity / 100.0)) / 3.0
      ), 3)                                                         AS vpd_score,
      ROUND(GREATEST(0.0, LEAST(1.0,
        CASE
          WHEN w.Rainfall24Hr > 0
            THEN 1.0 - LEAST(1.0, w.Rainfall24Hr / 20.0)
          ELSE
            (w.AirTemperature - w.DewPoint) / 10.0
        END
      )), 3)                                                        AS rain_factor,
      ROUND(LEAST(1.0, a.aqi / 200.0), 3)                          AS aqi_factor,
      ROUND((
        0.6 * (1.0 - (s.soil_moisture / 100.0))
        + 0.4 * LEAST(1.0,
          (0.6108 * EXP((17.27 * s.temperature) / (s.temperature + 237.3))
          * (1 - s.humidity / 100.0)) / 3.0
        )
      )
      * GREATEST(0.0, LEAST(1.0,
        CASE
          WHEN w.Rainfall24Hr > 0
            THEN 1.0 - LEAST(1.0, w.Rainfall24Hr / 20.0)
          ELSE
            (w.AirTemperature - w.DewPoint) / 10.0
        END
      ))
      * LEAST(1.0, a.aqi / 200.0)
      , 3)                                                          AS iui
    FROM munyin_sensors s
    JOIN munyin_tmd w ON DATE(s.ts) = DATE(w.ts)
    JOIN munyin_aqi a ON DATE(s.ts) = DATE(a.ts)
    ORDER BY s.ts DESC
    LIMIT 1
  `);
  return rows[0] || null;
}

async function getHistory(hours) {
  const [rows] = await pool.query(`
    SELECT
      s.ts,
      s.temperature,
      s.humidity,
      s.soil_moisture,
      ROUND(
        0.6108 * EXP((17.27 * s.temperature) / (s.temperature + 237.3))
        * (1 - s.humidity / 100.0)
      , 3)                                                          AS vpd,
      ROUND((
        0.6 * (1.0 - (s.soil_moisture / 100.0))
        + 0.4 * LEAST(1.0,
          (0.6108 * EXP((17.27 * s.temperature) / (s.temperature + 237.3))
          * (1 - s.humidity / 100.0)) / 3.0
        )
      )
      * GREATEST(0.0, LEAST(1.0,
        CASE
          WHEN w.Rainfall24Hr > 0
            THEN 1.0 - LEAST(1.0, w.Rainfall24Hr / 20.0)
          ELSE
            (w.AirTemperature - w.DewPoint) / 10.0
        END
      ))
      * LEAST(1.0, a.aqi / 200.0)
      , 3)                                                          AS iui
    FROM munyin_sensors s
    JOIN munyin_tmd w ON DATE(s.ts) = DATE(w.ts)
    JOIN munyin_aqi a ON DATE(s.ts) = DATE(a.ts)
    WHERE s.ts >= NOW() - INTERVAL ? HOUR
    ORDER BY s.ts ASC
  `, [hours]);
  return rows;
}

async function getStatus() {
  const [[sensor]] = await pool.query(`
    SELECT
      CASE WHEN MAX(ts) >= NOW() - INTERVAL 20 MINUTE
        THEN 'ok' ELSE 'error'
      END AS sensor_status
    FROM munyin_sensors
  `);
  const [[tmd]] = await pool.query(`
    SELECT
      CASE WHEN MAX(ts) >= NOW() - INTERVAL 2 HOUR
        THEN 'ok' ELSE 'error'
      END AS tmd_status
    FROM munyin_tmd
  `);
  const [[aqi]] = await pool.query(`
    SELECT
      CASE WHEN MAX(ts) >= NOW() - INTERVAL 2 HOUR
        THEN 'ok' ELSE 'error'
      END AS aqi_status
    FROM munyin_aqi
  `);
  return {
    sensor: sensor.sensor_status,
    tmd: tmd.tmd_status,
    aqi: aqi.aqi_status,
  };
}

module.exports = { getLatest, getHistory, getStatus };
```

- [ ] **Step 2: Commit**

```bash
git add src/models/sensorModel.js
git commit -m "feat: add sensor model with getLatest, getHistory, getStatus"
```

---

## Task 4: Controller Tests (write tests first — TDD)

**Files:**
- Create: `backend/tests/api.test.js`

- [ ] **Step 1: Create test file**

Create `backend/tests/api.test.js`:

```js
const request = require('supertest');
const app = require('../src/app');

jest.mock('../src/models/sensorModel');
const sensorModel = require('../src/models/sensorModel');

const MOCK_ROW = {
  ts: '2026-04-06 14:40:55',
  temperature: 28, humidity: 80, soil_moisture: 54.2, soil_raw: 1877,
  air_temperature: 35.2, dew_point: 24.3, weather_humidity: 53, rainfall_24hr: 0,
  aqi: 69, pm25: 69, pm10: 20,
  vpd: 0.756, soil_score: 0.458, vpd_score: 0.252,
  rain_factor: 0.11, aqi_factor: 0.345, iui: 0.027,
};

beforeEach(() => jest.clearAllMocks());

// ── /api/latest ──────────────────────────────────────────────────────────────

describe('GET /api/latest', () => {
  it('returns 200 with correct nested shape', async () => {
    sensorModel.getLatest.mockResolvedValue(MOCK_ROW);
    const res = await request(app).get('/api/latest');
    expect(res.status).toBe(200);
    expect(res.body.ts).toBe('2026-04-06 14:40:55');
    expect(res.body.sensor).toEqual({
      temperature: 28, humidity: 80, soil_moisture: 54.2, soil_raw: 1877,
    });
    expect(res.body.weather).toEqual({
      air_temperature: 35.2, dew_point: 24.3, humidity: 53, rainfall_24hr: 0,
    });
    expect(res.body.aqi).toEqual({ aqi: 69, pm25: 69, pm10: 20 });
    expect(res.body.computed).toEqual({
      vpd: 0.756, soil_score: 0.458, vpd_score: 0.252,
      rain_factor: 0.11, aqi_factor: 0.345, iui: 0.027,
    });
  });

  it('returns 404 when model returns null', async () => {
    sensorModel.getLatest.mockResolvedValue(null);
    const res = await request(app).get('/api/latest');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'No data available' });
  });

  it('returns 500 on db error', async () => {
    sensorModel.getLatest.mockRejectedValue(new Error('DB down'));
    const res = await request(app).get('/api/latest');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Database error' });
  });
});

// ── /api/history ─────────────────────────────────────────────────────────────

describe('GET /api/history', () => {
  const MOCK_ROWS = [
    { ts: '2026-04-06 00:00:00', temperature: 26.5, humidity: 72.1,
      soil_moisture: 52.3, vpd: 0.45, iui: 0.12 },
  ];

  it('returns 200 with data array', async () => {
    sensorModel.getHistory.mockResolvedValue(MOCK_ROWS);
    const res = await request(app).get('/api/history?hours=24');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toHaveProperty('ts');
    expect(res.body.data[0]).toHaveProperty('iui');
    expect(sensorModel.getHistory).toHaveBeenCalledWith(24);
  });

  it('defaults to 24 hours when hours param omitted', async () => {
    sensorModel.getHistory.mockResolvedValue([]);
    const res = await request(app).get('/api/history');
    expect(res.status).toBe(200);
    expect(sensorModel.getHistory).toHaveBeenCalledWith(24);
  });

  it('returns 400 for hours=-1', async () => {
    const res = await request(app).get('/api/history?hours=-1');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid hours parameter' });
  });

  it('returns 400 for hours=0', async () => {
    const res = await request(app).get('/api/history?hours=0');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid hours parameter' });
  });

  it('returns 400 for hours=abc', async () => {
    const res = await request(app).get('/api/history?hours=abc');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid hours parameter' });
  });

  it('returns 500 on db error', async () => {
    sensorModel.getHistory.mockRejectedValue(new Error('DB down'));
    const res = await request(app).get('/api/history?hours=24');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Database error' });
  });
});

// ── /api/status ───────────────────────────────────────────────────────────────

describe('GET /api/status', () => {
  it('returns 200 with ok statuses', async () => {
    sensorModel.getStatus.mockResolvedValue({ sensor: 'ok', tmd: 'ok', aqi: 'ok' });
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sensor: 'ok', tmd: 'ok', aqi: 'ok' });
  });

  it('returns error status when a source is stale', async () => {
    sensorModel.getStatus.mockResolvedValue({ sensor: 'error', tmd: 'ok', aqi: 'ok' });
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body.sensor).toBe('error');
  });

  it('returns 500 on db error', async () => {
    sensorModel.getStatus.mockRejectedValue(new Error('DB down'));
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Database error' });
  });
});
```

- [ ] **Step 2: Run tests — expect failure (app doesn't exist yet)**

```bash
pnpm test
```

Expected: FAIL — `Cannot find module '../src/app'`

---

## Task 5: App Skeleton + Routes

**Files:**
- Create: `backend/src/routes/api.js`
- Create: `backend/src/app.js`
- Create: `backend/index.js`

- [ ] **Step 1: Create routes stub**

Create `backend/src/routes/api.js`:

```js
const { Router } = require('express');

const router = Router();

module.exports = router;
```

- [ ] **Step 2: Create app.js**

Create `backend/src/app.js`:

```js
const express = require('express');
const cors = require('cors');
const apiRouter = require('./routes/api');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', apiRouter);

module.exports = app;
```

- [ ] **Step 3: Create index.js**

Create `backend/index.js`:

```js
require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

- [ ] **Step 4: Run tests — expect failure (routes not wired)**

```bash
pnpm test
```

Expected: FAIL — tests hit 404 because routes are not registered yet.

---

## Task 6: Data Controller

**Files:**
- Create: `backend/src/controllers/dataController.js`

- [ ] **Step 1: Create dataController.js**

Create `backend/src/controllers/dataController.js`:

```js
const sensorModel = require('../models/sensorModel');

async function latest(req, res) {
  try {
    const row = await sensorModel.getLatest();
    if (!row) return res.status(404).json({ error: 'No data available' });
    res.json({
      ts: row.ts,
      sensor: {
        temperature: row.temperature,
        humidity: row.humidity,
        soil_moisture: row.soil_moisture,
        soil_raw: row.soil_raw,
      },
      weather: {
        air_temperature: row.air_temperature,
        dew_point: row.dew_point,
        humidity: row.weather_humidity,
        rainfall_24hr: row.rainfall_24hr,
      },
      aqi: {
        aqi: row.aqi,
        pm25: row.pm25,
        pm10: row.pm10,
      },
      computed: {
        vpd: row.vpd,
        soil_score: row.soil_score,
        vpd_score: row.vpd_score,
        rain_factor: row.rain_factor,
        aqi_factor: row.aqi_factor,
        iui: row.iui,
      },
    });
  } catch {
    res.status(500).json({ error: 'Database error' });
  }
}

async function history(req, res) {
  let hours = 24;
  if (req.query.hours !== undefined) {
    hours = parseInt(req.query.hours, 10);
    if (Number.isNaN(hours) || hours <= 0) {
      return res.status(400).json({ error: 'Invalid hours parameter' });
    }
  }
  try {
    const rows = await sensorModel.getHistory(hours);
    res.json({ data: rows });
  } catch {
    res.status(500).json({ error: 'Database error' });
  }
}

async function status(req, res) {
  try {
    const result = await sensorModel.getStatus();
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Database error' });
  }
}

module.exports = { latest, history, status };
```

---

## Task 7: Wire Routes + Pass Tests

**Files:**
- Modify: `backend/src/routes/api.js`

- [ ] **Step 1: Update routes/api.js to register all handlers**

Replace the contents of `backend/src/routes/api.js` with:

```js
const { Router } = require('express');
const controller = require('../controllers/dataController');

const router = Router();

router.get('/latest', controller.latest);
router.get('/history', controller.history);
router.get('/status', controller.status);

module.exports = router;
```

- [ ] **Step 2: Run tests — expect all pass**

```bash
pnpm test
```

Expected output:
```
PASS tests/api.test.js
  GET /api/latest
    ✓ returns 200 with correct nested shape
    ✓ returns 404 when model returns null
    ✓ returns 500 on db error
  GET /api/history
    ✓ returns 200 with data array
    ✓ defaults to 24 hours when hours param omitted
    ✓ returns 400 for hours=-1
    ✓ returns 400 for hours=0
    ✓ returns 400 for hours=abc
    ✓ returns 500 on db error
  GET /api/status
    ✓ returns 200 with ok statuses
    ✓ returns error status when a source is stale
    ✓ returns 500 on db error

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
```

- [ ] **Step 3: Commit all source files**

```bash
git add src/app.js src/routes/api.js src/controllers/dataController.js index.js tests/api.test.js
git commit -m "feat: implement all API endpoints with tests"
```

---

## Task 8: Smoke Test Against Real DB

- [ ] **Step 1: Start the dev server**

```bash
pnpm dev
```

Expected: `Server running on port 3000`

- [ ] **Step 2: Hit /api/status**

```bash
curl http://localhost:3000/api/status
```

Expected: `{"sensor":"ok","tmd":"ok","aqi":"ok"}` (or `"error"` if data is stale)

- [ ] **Step 3: Hit /api/latest**

```bash
curl http://localhost:3000/api/latest
```

Expected: JSON with `ts`, `sensor`, `weather`, `aqi`, `computed` keys.

- [ ] **Step 4: Hit /api/history**

```bash
curl "http://localhost:3000/api/history?hours=6"
```

Expected: `{"data":[...]}` with array of time-series rows.

- [ ] **Step 5: Test invalid hours**

```bash
curl "http://localhost:3000/api/history?hours=-5"
```

Expected: `{"error":"Invalid hours parameter"}` with HTTP 400.

- [ ] **Step 6: Commit if all good**

```bash
git add .
git commit -m "chore: verify backend smoke tests pass against real DB"
```
