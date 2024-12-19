const db = require('../db');
const axios = require('axios');

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

      const apiBaseUrl = process.env.API_BASE_URL;

      const machineDataWithOEE = await Promise.all(result.rows.map(async (machine) => {
          try {
              const oeeResponse = await axios.get(`${apiBaseUrl}/device_data/${machine.machine_id}/${start_date}/${end_date}`);
              const oeeData = oeeResponse.data;

              machine.oee = oeeData.OEE;
              machine.availability = oeeData.Availability;
              machine.performance = oeeData.Performance;
              machine.quality = oeeData.Quality;

              return machine;
          } catch (error) {
              console.error(`Error fetching OEE data for machine ${machine.machine_id}:`, error);
              machine.oee = null;
              return machine;
          }
      }));

      res.status(200).json(machineDataWithOEE);
  } catch (err) {
      console.error('Error fetching data:', err);
      res.status(500).json({ error: 'Internal server error' });
  }
}

async function machineByCompanyIdFirst(req, res) {
  const { company_id } = req.params;

  const query = `
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
                      'machine_image_path', p.machine_image_path,
                      'machine_image_name', p.machine_image_name
                  )
              ) FILTER (WHERE p.machine_part_id IS NOT NULL),
              '[]'
          ) AS model_data

      FROM oee.oee_machine m
      JOIN oee.oee_machine_type mt 
      ON m.machine_type_id = mt.machine_type_id
      LEFT JOIN oee.oee_machine_parts p 
      ON m.machine_uid = p.machine_id
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
          m.company_id;
  `;

  try {
      const result = await db.query(query, [company_id]);
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

  const holidayQuery = `
    SELECT 
      holiday_id, 
      holiday_name, 
      TO_CHAR(TO_TIMESTAMP(holiday_date, 'YYYY-MM-DD"T"HH24:MI:SS.MSZ'), 'DD/MM/YYYY') AS holiday_date,
      holiday_image, 
      created_by, 
      company_id
    FROM 
      oee.oee_holidays 
    WHERE 
      company_id = $1
    ORDER BY 
      TO_DATE(TO_CHAR(TO_TIMESTAMP(holiday_date, 'YYYY-MM-DD"T"HH24:MI:SS.MSZ'), 'DD/MM/YYYY'), 'DD/MM/YYYY') ASC
  `;

  const shiftQuery = `
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
      shifts.company_id = $1
  `;

  try {
    const [holidayResult, shiftResult] = await Promise.all([
      db.query(holidayQuery, [company_id]),
      db.query(shiftQuery, [company_id]),
    ]);

    const responseData = {
      holidays: holidayResult.rows,
      shifts: shiftResult.rows,
    };

    if (responseData.holidays.length === 0 && responseData.shifts.length === 0) {
      return res.status(404).json({ error: 'No data found for the specified company' });
    }

    res.status(200).json(responseData);
  } catch (err) {
    console.error('Error fetching company data:', err);
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

// Technical Support
async function makeRequest(req, res) {
  const { request_subject, division, product_family, machine_brand, type_of_request, created_by, machine_uid, description } = req.body;

  if (!request_subject || !division || !product_family || !machine_brand || !type_of_request || !created_by || !machine_uid) {
    return res.status(400).json({ error: 'All fields except description are required' });
  }

  const query = `
    INSERT INTO oee.customer_support (
      request_subject, 
      division, 
      product_family, 
      machine_brand, 
      type_of_request, 
      description, 
      created_by, 
      machine_uid, 
      request_status
    ) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *;
  `;

  try {
    const result = await db.query(query, [
      request_subject,
      division,
      product_family,
      machine_brand,
      type_of_request,
      description || null,
      created_by,
      machine_uid,
      0
    ]);

    res.status(201).json({
      message: 'Request created successfully',
      request_id: result.rows[0].request_id
    });
  } catch (err) {
    console.error('Error creating request:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// profile
async function getUserWithCompanyData(req, res) {
  const { user_id } = req.params;

  const query = `
    SELECT 
      ui.user_id,
      ui.first_name,
      ui.last_name,
      ui.personal_email,
      ui.designation,
      ui.company_id,
      ui.verified,
      ui.block,
      ui.verification_token,
      ci.company_name, 
      ci.company_email,
      ci.contact_no,
      ci.location
    FROM oee.oee_user_info ui
    JOIN oee.oee_company_info ci 
      ON ui.company_id = ci.company_id
    WHERE ui.user_id = $1;
  `;

  try {
    const result = await db.query(query, [user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found or no company associated with this user' });
    }

    // Send the user data along with company data
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching user and company data:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Breakdowns [Need Optimization]
async function getBreakdowns(req, res) {
  const { machine_uid, start_time, end_time } = req.params;

  const machineQuery = `
      SELECT machine_id 
      FROM oee.oee_machine 
      WHERE machine_uid = $1;
  `;

  const alarmsQuery = `
      SELECT alarm_code, alarm_description 
      FROM oee.oee_alarms;
  `;

  const dataQuery = `
      WITH alarm_data AS (
          SELECT
              dd."data" ->> alarm_code AS alarm_status,
              dd."timestamp" AS timestamp,
              alarm_code,
              alarm_description
          FROM oee.device_data dd
          CROSS JOIN (
              SELECT alarm_code, alarm_description
              FROM oee.oee_alarms
          ) alarms
          WHERE dd.deviceuid = $1
            AND dd."timestamp" BETWEEN $2 AND $3
            AND (dd."data" ->> alarm_code)::integer IS NOT NULL
      ),
      alarm_transitions AS (
          SELECT
              alarm_code,
              alarm_description,
              timestamp,
              LAG(alarm_status) OVER (PARTITION BY alarm_code ORDER BY timestamp) AS prev_status,
              alarm_status,
              LEAD(timestamp) OVER (PARTITION BY alarm_code ORDER BY timestamp) AS next_timestamp
          FROM alarm_data
      ),
      alarm_durations AS (
          SELECT
              alarm_code,
              alarm_description,
              CASE WHEN prev_status = '0' AND alarm_status = '1' THEN 1 ELSE 0 END AS count_increment,
              CASE WHEN alarm_status = '1' THEN EXTRACT(EPOCH FROM next_timestamp - timestamp) ELSE 0 END AS duration_increment
          FROM alarm_transitions
      ),
      aggregated_alarms AS (
          SELECT
              alarm_code,
              alarm_description,
              SUM(count_increment) AS count,
              SUM(duration_increment) AS duration
          FROM alarm_durations
          GROUP BY alarm_code, alarm_description
          HAVING SUM(count_increment) > 0
      ),
      total_metrics AS (
          SELECT
              SUM(count) AS total_count,
              SUM(duration) AS total_duration
          FROM aggregated_alarms
      )
      SELECT
          a.alarm_code,
          a.alarm_description,
          COALESCE(aa.count, 0) AS count,
          COALESCE(ROUND(aa.duration / 3600.0, 2), 0) AS duration,
          ROUND(COALESCE(aa.count, 0) * 100.0 / NULLIF(tm.total_count, 0), 0) AS cumulative_percent_count,
          ROUND(COALESCE(aa.duration, 0) * 100.0 / NULLIF(tm.total_duration, 0), 0) AS cumulative_percent_duration
      FROM oee.oee_alarms a
      LEFT JOIN aggregated_alarms aa ON a.alarm_code = aa.alarm_code
      CROSS JOIN total_metrics tm
      WHERE COALESCE(aa.count, 0) > 0;
  `;

  try {
      const machineResult = await db.query(machineQuery, [machine_uid]);
      if (machineResult.rows.length === 0) {
          return res.status(404).json({ error: 'Machine not found' });
      }

      const machine_id = machineResult.rows[0].machine_id;

      const alarmsResult = await db.query(alarmsQuery);
      if (alarmsResult.rows.length === 0) {
          return res.status(404).json({ error: 'No alarms configured' });
      }

      const deviceDataResult = await db.query(dataQuery, [machine_id, start_time, end_time]);
      res.status(200).json(deviceDataResult.rows);
  } catch (err) {
      console.error('Error fetching breakdowns:', err);
      res.status(500).json({ error: 'Internal server error' });
  }
}

async function getMachineMetrics(req, res) {
  const { machine_uid, start_time, end_time } = req.params;

  const machineQuery = `
      SELECT machine_id
      FROM oee.oee_machine
      WHERE machine_uid = $1;
  `;

  const metricsQuery = `
      WITH alarm_data AS (
          SELECT
              dd."timestamp" AS alarm_timestamp,
              dd."data" ->> 'MC_STATUS' AS mc_status,
              dd."data" ->> alarm_code AS alarm_status,
              alarm_code,
              LAG(dd."data" ->> alarm_code) OVER (PARTITION BY alarm_code ORDER BY dd."timestamp") AS prev_alarm_status,
              LAG(dd."timestamp") OVER (PARTITION BY alarm_code ORDER BY dd."timestamp") AS prev_timestamp,
              LEAD(dd."timestamp") OVER (PARTITION BY alarm_code ORDER BY dd."timestamp") AS next_timestamp
          FROM oee.device_data dd
          CROSS JOIN (
              SELECT alarm_code
              FROM oee.oee_alarms
          ) alarms
          WHERE dd.deviceuid = $1
            AND dd."timestamp" BETWEEN $2 AND $3
      ),
      alarm_metrics AS (
          SELECT
              SUM(
                  CASE WHEN alarm_status = '1' THEN 
                      EXTRACT(EPOCH FROM next_timestamp - alarm_timestamp)
                  ELSE 0 END
              ) AS total_active_time,
              SUM(
                  CASE WHEN mc_status = '1' AND alarm_status IS NULL THEN 
                      EXTRACT(EPOCH FROM next_timestamp - alarm_timestamp)
                  ELSE 0 END
              ) AS total_uptime,
              COUNT(*) FILTER (
                  WHERE prev_alarm_status = '0' AND alarm_status = '1'
              ) AS total_alarm_count
          FROM alarm_data
      ),
      time_frame AS (
          SELECT EXTRACT(DAY FROM ($3::timestamp - $2::timestamp)) + 1 AS total_days
      )
      SELECT
          ROUND(total_alarm_count::numeric / tf.total_days, 2) AS mean_alarm_count_per_day,
          ROUND(total_active_time::numeric / tf.total_days, 2) AS mean_alarm_duration_per_day,
          ROUND(total_uptime::numeric / NULLIF(total_alarm_count, 0), 2) AS mean_time_between_alarms,
          ROUND(total_active_time::numeric / NULLIF(total_alarm_count, 0), 2) AS mean_time_to_restart_on_alarm
      FROM alarm_metrics, time_frame tf;
  `;

  try {
      const machineResult = await db.query(machineQuery, [machine_uid]);

      if (machineResult.rows.length === 0) {
          return res.status(404).json({ error: 'Machine not found' });
      }

      const machine_id = machineResult.rows[0].machine_id;

      const metricsResult = await db.query(metricsQuery, [machine_id, start_time, end_time]);

      res.status(200).json(metricsResult.rows[0]);
  } catch (err) {
      console.error('Error fetching machine metrics:', err);
      res.status(500).json({ error: 'Internal server error' });
  }
}

// State Analysis
async function getMachineTimeFrame(req, res) {
  const { machine_uid, start_time, end_time, interval } = req.params;

  const machineQuery = `
      SELECT machine_id, company_id
      FROM oee.oee_machine
      WHERE machine_uid = $1;
  `;

  const shiftQuery = `
      SELECT *
      FROM oee.oee_shifts
      WHERE company_id = $1;
  `;

  const holidayQuery = `
      SELECT *
      FROM oee.oee_holidays
      WHERE company_id = $1;
  `;

  try {
    const machineResult = await db.query(machineQuery, [machine_uid]);

    if (machineResult.rows.length === 0) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    const { machine_id, company_id } = machineResult.rows[0];

    if (interval === 'Shift') {

    }  

    const metricsQuery = `
      WITH interval_data AS (
            SELECT
                CASE $4
                    WHEN 'Hour' THEN date_trunc('hour', "timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')
                    WHEN 'Day' THEN date_trunc('day', "timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')
                    WHEN 'Week' THEN date_trunc('week', "timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')
                    WHEN 'Month' THEN date_trunc('month', "timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')
                END AS interval_key,
                "timestamp",
                LEAD("timestamp") OVER (PARTITION BY date_trunc('hour', "timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') ORDER BY "timestamp") AS next_timestamp,
                "data"->>'MC_STATUS' AS mc_status,
                "data"->>'Act Speed' AS act_speed
            FROM oee.device_data
            WHERE deviceuid = $1
              AND "timestamp" BETWEEN $2 AND $3
        ),
        metrics AS (
            SELECT
                interval_key,
                SUM(
                    CASE
                        WHEN mc_status = '0' AND next_timestamp > "timestamp" THEN
                            EXTRACT(EPOCH FROM next_timestamp - "timestamp")
                        ELSE 0
                    END
                ) AS downtime,
                SUM(
                    CASE
                        WHEN mc_status = '1' AND act_speed::numeric > 0 AND next_timestamp > "timestamp" THEN
                            EXTRACT(EPOCH FROM next_timestamp - "timestamp")
                        ELSE 0
                    END
                ) AS production_time,
                SUM(
                    CASE
                        WHEN mc_status = '1' AND act_speed::numeric = 0 AND next_timestamp > "timestamp" THEN
                            EXTRACT(EPOCH FROM next_timestamp - "timestamp")
                        ELSE 0
                    END
                ) AS setup_time
            FROM interval_data
            GROUP BY interval_key
        )
        SELECT
            interval_key,
            ROUND(downtime/3600, 2) AS downtime,
            ROUND(production_time/3600, 2) AS production_time,
            ROUND(setup_time/3600, 2) AS setup_time
        FROM metrics
        ORDER BY interval_key;
    `;

    const metricsResult = await db.query(metricsQuery, [machine_id, start_time, end_time, interval]);
    res.status(200).json(metricsResult.rows);
  } catch (err) {
    console.error('Error fetching machine metrics:', err);
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
  updateHoliday,
  deleteHoliday,
  makeRequest,
  getUserWithCompanyData,
  machineByCompanyIdFirst,
  getBreakdowns,
  getMachineMetrics,
  getMachineTimeFrame
}