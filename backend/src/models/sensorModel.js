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
    WHERE s.ts >= (select ts from munyin_sensors order by ts desc limit 1) - INTERVAL ? HOUR
    ORDER BY s.ts ASC
  `, [hours]);
  return rows;
}

async function getStatus() {
  const [[sensor]] = await pool.query(`
    SELECT
      CASE WHEN MAX(ts) >= (SELECT ts from munyin_sensors order by ts desc limit 1) - INTERVAL 20 MINUTE
        THEN 'ok' ELSE 'error'
      END AS sensor_status
    FROM munyin_sensors
  `);
  const [[tmd]] = await pool.query(`
    SELECT
      CASE WHEN MAX(ts) >= (SELECT ts from munyin_tmd order by ts desc limit 1) - INTERVAL 2 HOUR
        THEN 'ok' ELSE 'error'
      END AS tmd_status
    FROM munyin_tmd
  `);
  const [[aqi]] = await pool.query(`
    SELECT
      CASE WHEN MAX(ts) >= (SELECT ts from munyin_aqi order by ts desc limit 1) - INTERVAL 2 HOUR
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
