# Munyin Dashboard

Sensor monitoring dashboard for Munyin station. React + Vite frontend, Express + MySQL backend.

## Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- MySQL/MariaDB with access to `munyin_sensors`, `munyin_tmd`, `munyin_aqi` tables

---

## Backend Setup

```bash
cd backend
pnpm install
```

Copy and fill in env:

```bash
cp .env.example .env
```

Edit `backend/.env`:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name
```

Start dev server:

```bash
pnpm dev
```

Or production:

```bash
pnpm start
```

Run tests:

```bash
pnpm test
```

Backend runs at `http://localhost:3000`

---

## Frontend Setup

```bash
# from project root
pnpm install
pnpm dev
```

Frontend runs at `http://localhost:5173`

---

## Primary Data
KidBright board collects soil moisture (ZX-SOIL) and temp/humidity (KY-015) every 10 minutes → MQTT (topic: /b6710545849/MUNYIN/status) → Node Red →  pushed to MySQL database

## Secondary Data
Node Red 1 hour interval → collect data from tmd.go.th (rain probability) and aqicn.org (AQI) used as adjustment coefficients in the IUI formula

## API Endpoints

| Method | Path | Description | Params |
|--------|------|-------------|--------|
| GET | `/api/latest` | Latest sensor + weather + AQI + computed metrics | — |
| GET | `/api/history` | Historical sensor data | `?hours=24` |
| GET | `/api/status` | Health check for all data sources | — |