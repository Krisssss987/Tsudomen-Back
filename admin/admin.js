const db = require('../db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');

async function getMachineName(req, res) {
    const { machine_id } = req.params;

    const query = `
        Select * from oee.oee_machine where machine_uid = $1;
    `;

    try {
        const result = await db.query(query, [machine_id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No machines found' });
        }
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching data:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}


// homepage
async function machineByCompanyId(req, res) {
  const { company_id, start_date, end_date } = req.params;

  const query = `
      WITH month_data AS (
          SELECT 
              dd.deviceuid AS machine_id,
              EXTRACT(YEAR FROM dd.timestamp) AS year,
              EXTRACT(MONTH FROM dd.timestamp) AS month,
              MAX((dd.data->>'This Month Production')::NUMERIC) AS max_prod,
              MIN((dd.data->>'This Month Production')::NUMERIC) AS min_prod
          FROM oee.device_data dd
          WHERE dd.timestamp >= TO_TIMESTAMP($2, 'YYYY-MM-DD HH24:MI:SS')
          AND dd.timestamp <= TO_TIMESTAMP($3, 'YYYY-MM-DD HH24:MI:SS')
          GROUP BY dd.deviceuid, EXTRACT(YEAR FROM dd.timestamp), EXTRACT(MONTH FROM dd.timestamp)
      ),
      
      reel_transitions AS (
          SELECT 
              dd.deviceuid AS machine_id,
              COUNT(*) AS produced_reels
          FROM oee.device_data dd
          JOIN (
              SELECT 
                  deviceuid,
                  LAG(dd.data->>'P_DT_BOBIN_FORMER_CHANGE') OVER (PARTITION BY dd.deviceuid ORDER BY dd.timestamp) AS prev_value,
                  dd.data->>'P_DT_BOBIN_FORMER_CHANGE' AS current_value
              FROM oee.device_data dd
              WHERE dd.timestamp >= TO_TIMESTAMP($2, 'YYYY-MM-DD HH24:MI:SS')
              AND dd.timestamp <= TO_TIMESTAMP($3, 'YYYY-MM-DD HH24:MI:SS')
          ) AS transitions
          ON dd.deviceuid = transitions.deviceuid
          WHERE transitions.prev_value = '0' AND transitions.current_value = '1'
          GROUP BY dd.deviceuid
      )

      SELECT 
          m.machine_uid,
          m.machine_id,
          m.machine_name,
          m.machine_plant,
          m.machine_model,
          m.machine_customer,
          m.machine_location,
          m.machine_longitude,
          m.machine_latitude,
          mt.machine_type_name,
          m.company_id,
          
          COALESCE(
              JSON_AGG(
                  JSON_BUILD_OBJECT(
                      'machine_part_id', p.machine_part_id,
                      'machine_part_name', p.machine_part_name,
                      'machine_part_serial_no', p.machine_part_serial_no,
                      'machine_image_path', p.machine_image_path,
                      'machine_image_name', p.machine_image_name
                  )
              ) FILTER (WHERE p.machine_part_id IS NOT NULL),
              '[]'
          ) AS model_data,
          
          COALESCE(
              (
                  SELECT 
                      CASE
                          WHEN dd.deviceuid IS NULL THEN 2
                          WHEN dd.data->>'MC_STATUS' IS NOT NULL THEN 
                              CASE
                                  WHEN dd.data->>'MC_STATUS' = '0' THEN 0
                                  WHEN dd.data->>'MC_STATUS' = '1' AND (dd.data->>'Act Speed')::NUMERIC = 0 THEN 3
                                  WHEN dd.data->>'MC_STATUS' = '1' AND (dd.data->>'Act Speed')::NUMERIC < 0.5 * (dd.data->>'Target Speed')::NUMERIC THEN 4
                                  WHEN dd.data->>'MC_STATUS' = '1' THEN 1
                                  ELSE 2
                              END
                          ELSE 2
                      END AS status
                  FROM oee.device_data dd
                  WHERE dd.deviceuid = m.machine_id
                  AND dd.timestamp >= NOW() - INTERVAL '15 minutes'
                  ORDER BY dd.timestamp DESC
                  LIMIT 1
              ), 
              2
          ) AS status,

          COALESCE(
              (
                  SELECT ROUND(SUM(max_prod - min_prod), 0)
                  FROM month_data md
                  WHERE md.machine_id = m.machine_id
                  AND md.year = EXTRACT(YEAR FROM CURRENT_DATE)
                  AND md.month BETWEEN EXTRACT(MONTH FROM TO_TIMESTAMP($2, 'YYYY-MM-DD HH24:MI:SS')) 
                                      AND EXTRACT(MONTH FROM TO_TIMESTAMP($3, 'YYYY-MM-DD HH24:MI:SS'))
              ),
              0
          ) AS produced_length,

          COALESCE(rt.produced_reels, 0) AS produced_reels

      FROM oee.oee_machine m
      JOIN oee.oee_machine_type mt 
      ON m.machine_type_id = mt.machine_type_id
      LEFT JOIN oee.oee_machine_parts p 
      ON m.machine_uid = p.machine_id
      LEFT JOIN reel_transitions rt
      ON m.machine_id = rt.machine_id
      WHERE m.company_id = $1
      GROUP BY 
          m.machine_uid, 
          m.machine_id, 
          m.machine_name, 
          m.machine_plant, 
          m.machine_model, 
          m.machine_customer, 
          m.machine_location, 
          m.machine_longitude, 
          m.machine_latitude, 
          mt.machine_type_name,
          m.company_id, rt.produced_reels;
  `;

  try {
      const result = await db.query(query, [company_id, start_date, end_date]);
      if (result.rows.length === 0) {
          return res.status(404).json({ error: 'No machines found for this company' });
      }
      res.status(200).json(result.rows);
  } catch (err) {
      console.error('Error fetching data:', err);
      res.status(500).json({ error: 'Internal server error' });
  }
} 


// oee trend
async function dataByDeviceId(req, res) {
    const { device_id, start_date, end_date } = req.params;

    const query = `
    WITH per_minute_stats AS (
      SELECT
        TO_CHAR(DATE_TRUNC('minute', timestamp), 'HH24:MI') AS minute,
        COUNT(*) AS data_points,
        SUM(CASE WHEN (data->>'MC_STATUS')::numeric = 1 THEN 1 ELSE 0 END) AS uptime_points,
        SUM(CASE WHEN (data->>'MC_STATUS')::numeric = 0 THEN 1 ELSE 0 END) AS downtime_points
      FROM
        oee.device_data
      WHERE 
        deviceUid = $1
        AND data::jsonb ? 'MC_STATUS'
        AND timestamp BETWEEN $2 AND $3
      GROUP BY
        DATE_TRUNC('minute', timestamp)
    ),
    availability AS (
      SELECT
        (SUM(uptime_points * 1.0 / data_points) / 
         NULLIF(SUM(uptime_points * 1.0 / data_points) + SUM(downtime_points * 1.0 / data_points), 0)) * 100 AS total_uptime_percentage
      FROM
        per_minute_stats
    ),
    production_data AS (
      SELECT 
        (data->>'LINE_SPEED')::numeric AS line_speed,
        (data->>'ACT_COLD_DIA')::numeric AS diameter,
        timestamp,
        LEAD(timestamp) OVER (ORDER BY timestamp) AS next_timestamp
      FROM 
        oee.device_data
      WHERE 
        deviceUid = $1
        AND data::jsonb ? 'LINE_SPEED'
        AND timestamp BETWEEN $2 AND $3
    ),
    calculated_data AS (
      SELECT 
        line_speed,
        diameter,
        EXTRACT(EPOCH FROM (next_timestamp - timestamp)) / 60 AS time_diff_minutes,
        timestamp
      FROM 
        production_data
      WHERE 
        next_timestamp IS NOT NULL
    ),
    actual_production_weight AS (
      SELECT 
        COALESCE(
          SUM(
            (3.14159 * ((diameter / 1000 / 2)^2) * 
            time_diff_minutes * 
            line_speed * 
            7860) / 1000
          ), 0
        ) AS actual_weight
      FROM 
        calculated_data
    ),
    per_minute_stats_for_performance AS (
      SELECT
        TO_CHAR(DATE_TRUNC('day', timestamp), 'YYYY-MM-DD') AS date,
        TO_CHAR(DATE_TRUNC('minute', timestamp), 'HH24:MI') AS minute,
        COUNT(*) AS data_points,
        SUM(CASE WHEN (data->>'MC_STATUS')::numeric = 1 THEN 1 ELSE 0 END) AS uptime_points,
        EXTRACT(EPOCH FROM MAX(timestamp) - MIN(timestamp)) / 60 AS time_diff_minutes,
        MAX((data->>'LINE_SPEED')::numeric) AS max_speed
      FROM
        oee.device_data
      WHERE 
        deviceUid = $1
        AND data::jsonb ? 'MC_STATUS'
        AND data::jsonb ? 'LINE_SPEED'
        AND timestamp BETWEEN $2 AND $3
      GROUP BY
        DATE_TRUNC('day', timestamp),
        DATE_TRUNC('minute', timestamp)
    ),
    daily_max_speed AS (
      SELECT
        date,
        MAX(max_speed) AS max_speed
      FROM
        per_minute_stats_for_performance
      GROUP BY
        date
    ),
    target_length AS (
      SELECT
        SUM(pms.uptime_points * 1.0 / pms.data_points * dms.max_speed * pms.time_diff_minutes) AS total_length
      FROM
        per_minute_stats_for_performance pms
      JOIN
        daily_max_speed dms
      ON
        pms.date = dms.date
    ),
    target_production_weight AS (
      SELECT
        COALESCE(
          SUM(
            (3.14159 * ((dia.diameter / 1000 / 2)^2) * 
            tl.total_length * 
            7860) / 1000
          ), 0
        ) AS target_weight
      FROM 
        target_length tl,
        (SELECT DISTINCT (data->>'ACT_COLD_DIA')::numeric AS diameter
         FROM oee.device_data
         WHERE deviceUid = $1
         AND data::jsonb ? 'ACT_COLD_DIA'
         AND timestamp BETWEEN $2 AND $3) dia
    )
    SELECT
      CASE
        WHEN availability.total_uptime_percentage = 0 OR (CASE WHEN target_weight = 0 THEN 0 ELSE (actual_weight / target_weight) * 100 END) = 0 THEN 0
        ELSE TO_CHAR((availability.total_uptime_percentage * (CASE WHEN target_weight = 0 THEN 0 ELSE (actual_weight / target_weight) * 100 END)) / 100, 'FM999999999.00')::numeric
      END AS "OEE",
      TO_CHAR(availability.total_uptime_percentage, 'FM999999999.00')::numeric AS "Availability",
      CASE 
        WHEN target_weight = 0 THEN 0
        ELSE TO_CHAR((actual_weight / target_weight) * 100, 'FM999999999.00')::numeric
      END AS "Performance",
      CASE 
        WHEN actual_weight = 0 THEN 100
        ELSE TO_CHAR((actual_weight / (actual_weight + 0)) * 100, 'FM999999999.00')::numeric  -- 0 used as a placeholder for rejected_production
      END AS "Quality"
    FROM
      availability,
      actual_production_weight,
      target_production_weight;
    `;

    try {
        const result = await db.query(query, [device_id, start_date, end_date]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No data found for this device within the specified time range.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching data:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}


// planning calendar
async function getShifts(req, res) {
  const { company_id } = req.params;

  const query = `
    SELECT 
      shifts.shift_id, 
      shifts.shift_name, 
      shifts.start_time, 
      shifts.end_time, 
      shifts.shift_days, 
      users.first_name, 
      users.last_name
    FROM 
      oee.oee_shifts shifts
    INNER JOIN 
      oee.oee_user_info users
    ON 
      shifts.created_by = users.user_id
    WHERE 
      shifts.company_id = $1;
  `;

  try {
    const result = await db.query(query, [company_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No shifts found for the specified company' });
    }
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching shifts:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function addShift(req, res) {
  const { shift_name, start_time, end_time, shift_days, created_by, company_id } = req.body;

  if (!shift_name || !start_time || !end_time || !shift_days || !created_by || !company_id) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const query = `
    INSERT INTO oee.oee_shifts (
      shift_name, 
      start_time, 
      end_time, 
      shift_days, 
      created_by, 
      company_id
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;

  try {
    const result = await db.query(query, [shift_name, start_time, end_time, shift_days, created_by, company_id]);
    res.status(201).json({
      message: 'Shift added successfully',
      shift_id: result.rows[0].shift_id
    });
  } catch (err) {
    console.error('Error adding shift:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function deleteShift(req, res) {
  const { shift_id } = req.params;

  if (!shift_id) {
    return res.status(400).json({ error: 'Shift ID is required' });
  }

  const query = `
    DELETE FROM oee.oee_shifts 
    WHERE shift_id = $1 
    RETURNING *;
  `;

  try {
    const result = await db.query(query, [shift_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Shift not found' });
    }
    res.status(200).json({
      message: 'Shift deleted successfully',
      deletedShift: result.rows[0].shift_id
    });
  } catch (err) {
    console.error('Error deleting shift:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function edit_shift(req, res) {
  const shift_id = req.params.shift_id;
  const { shift_name, start_time, end_time, shift_days, created_by } = req.body;

  const checkShiftQuery = `SELECT * FROM oee.oee_shifts WHERE shift_id = $1`;

  const editShiftQuery = `
    UPDATE oee.oee_shifts 
    SET shift_name = $2, 
        start_time = $3, 
        end_time = $4, 
        shift_days = $5, 
        created_by = $6
    WHERE shift_id = $1`;

  db.query(checkShiftQuery, [shift_id], (checkError, checkResult) => {
    if (checkError) {
      return res.status(500).json({ message: 'Error while checking shift', error: checkError });
    }

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Shift Not Found' });
    } else {
      db.query(
        editShiftQuery,
        [shift_id, shift_name, start_time, end_time, shift_days, created_by],
        (editError, editResult) => {
          if (editError) {
            return res.status(500).json({ message: 'Error updating shift', error: editError });
          }
          return res.status(200).json({ message: 'Shift updated successfully' });
        }
      );
    }
  });
}

async function addHoliday(req, res) {
  const { holiday_name, holiday_date, holiday_image, created_by, company_id } = req.body;

  if (!holiday_name || !holiday_date || !company_id) {
    return res.status(400).json({ error: 'holiday_name, holiday_date, and company_id are required' });
  }

  const checkQuery = `
    SELECT * FROM oee.oee_holidays 
    WHERE holiday_date = $1 AND company_id = $2
  `;

  const insertQuery = `
    INSERT INTO oee.oee_holidays (
      holiday_name, 
      holiday_date, 
      holiday_image, 
      created_by, 
      company_id
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;

  try {
    const checkResult = await db.query(checkQuery, [holiday_date, company_id]);
    if (checkResult.rows.length > 0) {
      return res.status(400).json({ error: 'A holiday on this date already exists for the specified company' });
    }

    const result = await db.query(insertQuery, [holiday_name, holiday_date, holiday_image, created_by, company_id]);
    res.status(201).json({
      message: 'Holiday added successfully',
      holiday: result.rows[0].holiday_id,
    });
  } catch (err) {
    console.error('Error adding holiday:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getHolidays(req, res) {
  const { company_id } = req.params;

  const query = `SELECT * FROM oee.oee_holidays WHERE company_id = $1`;

  try {
    const result = await db.query(query, [company_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No holidays found for this company' });
    }
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching holidays:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateHoliday(req, res) {
  const { holiday_id } = req.params;
  const { holiday_name, holiday_date, holiday_image, created_by, company_id } = req.body;

  if (!holiday_id || !company_id) {
    return res.status(400).json({ error: 'holiday_id and company_id are required' });
  }

  const checkQuery = `
    SELECT * FROM oee.oee_holidays 
    WHERE holiday_date = $1 AND company_id = $2 AND holiday_id != $3
  `;

  const updateQuery = `
    UPDATE oee.oee_holidays 
    SET holiday_name = $2, 
        holiday_date = $3, 
        holiday_image = $4, 
        created_by = $5
    WHERE holiday_id = $1 
    RETURNING *;
  `;

  try {
    const checkResult = await db.query(checkQuery, [holiday_date, company_id, holiday_id]);
    if (checkResult.rows.length > 0) {
      return res.status(400).json({ error: 'A holiday on this date already exists' });
    }

    const updateResult = await db.query(updateQuery, [
      holiday_id,
      holiday_name,
      holiday_date,
      holiday_image,
      created_by,
    ]);

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Holiday not found' });
    }

    res.status(200).json({
      message: 'Holiday updated successfully',
      updatedHoliday: updateResult.rows[0].holiday_id,
    });
  } catch (err) {
    console.error('Error updating holiday:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function deleteHoliday(req, res) {
  const { holiday_id } = req.params;

  const query = `DELETE FROM oee.oee_holidays WHERE holiday_id = $1 RETURNING *`;

  try {
    const result = await db.query(query, [holiday_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Holiday not found' });
    }
    res.status(200).json({
      message: 'Holiday deleted successfully',
      deletedHoliday: result.rows[0].holiday_id,
    });
  } catch (err) {
    console.error('Error deleting holiday:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  machineByCompanyId,
  getMachineName,
  dataByDeviceId,
  addShift,
  getShifts,
  deleteShift,
  edit_shift,
  addShift,
  addHoliday,
  getHolidays,
  updateHoliday,
  deleteHoliday,

}