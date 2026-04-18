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
