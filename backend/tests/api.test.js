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
