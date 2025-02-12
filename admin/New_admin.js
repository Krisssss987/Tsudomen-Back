const { json } = require('express');
const db = require('../db');
const { v4: uuidv4 } = require('uuid');
const { encryptData } = require('../token/crypto');

async function getMachineName(req, res) {
    const { machine_id } = req.params;
    const user = req.user;

    const query = `
        SELECT machine_id FROM oee.oee_machine 
        WHERE machine_uid = $1 AND company_id = $2;
    `;

    try {
        const result = await db.query(query, [machine_id, user.companyId]);

        if (result.rows.length === 0) {
            return res.status(404).json(encryptData({ error: 'Unable to find any machines found' }));
        }
        //res.status(200).json(encryptData(result.rows));
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching data:', err);
        res.status(500).json(encryptData({ error: 'Internal server error' }));
    }
}

// async function machineByCompanyIdFirst(req, res) {
//     const user = req.user; 

//     if (!user || !user.companyId) {
//         //return res.status(403).json(encryptData({ error: 'Unauthorized access. Invalid token.' }));
//         return res.status(403).json({ error: 'Unauthorized access. Invalid token.' });
//     }

//     const query = `
//         SELECT 
//             m.machine_uid,
//             m.machine_id,
//             m.machine_name,
//             m.machine_plant,
//             m.machine_model,
//             m.machine_customer,
//             m.machine_location,
//             m.machine_longitude,
//             m.machine_latitude,
//             mt.machine_type_name,
//             m.company_id,
//             COALESCE(p.machine_image_path, '') AS model_data
//         FROM oee.oee_machine m
//         JOIN oee.oee_machine_type mt ON m.machine_type_id = mt.machine_type_id
//         LEFT JOIN LATERAL (
//             SELECT machine_image_path
//             FROM oee.oee_machine_parts p
//             WHERE p.machine_id = m.machine_uid
//             ORDER BY p.machine_part_id ASC
//             LIMIT 1
//         ) p ON true
//         WHERE m.company_id = $1;
//     `;

//     try {
//         const result = await db.query(query, [user.companyId]);

//         if (result.rows.length === 0) {
//             return res.status(403).json(encryptData({ error: 'Access denied. You do not have permission to view this company\'s machines.' }));
//         }

//         res.status(200).json(result.rows);
//         //res.status(200).json(encryptData(result.rows));
//     } catch (err) {
//         console.error('Error fetching data:', err);
//         res.status(500).json(encryptData({ error: 'Internal server error' }));
//     }
// }

// async function machineDataWithStatus(req, res) {
//     const user = req.user;
//     console.log(user)
//     const query = `
//         WITH machine_status AS (
//             SELECT 
//                 dd.deviceuid AS machine_id,
//                 MAX(dd.timestamp) AS last_data_time,
//                 CASE 
//                     WHEN MAX(dd.timestamp) < NOW() - INTERVAL '15 minutes' THEN 2  -- Offline
//                     WHEN MAX((dd.data->>'MC_STATUS')::NUMERIC) = 0 THEN 0  -- Stopped
//                     WHEN MAX((dd.data->>'MC_STATUS')::NUMERIC) = 1 AND MAX((dd.data->>'Act Speed')::NUMERIC) = 0 THEN 3  -- Idle
//                     WHEN MAX((dd.data->>'MC_STATUS')::NUMERIC) = 1 
//                          AND MAX((dd.data->>'Act Speed')::NUMERIC) < 0.5 * MAX((dd.data->>'Target Speed')::NUMERIC) THEN 4  -- Running Below Target Speed
//                     WHEN MAX((dd.data->>'MC_STATUS')::NUMERIC) = 1 THEN 1  -- Running
//                     ELSE 5  -- Unknown
//                 END AS status_code
//             FROM oee.device_data dd
//             WHERE dd.timestamp >= NOW() - INTERVAL '15 minutes'
//             GROUP BY dd.deviceuid
//         )

//         SELECT 
//             m.machine_uid,
//             m.machine_id,
//             m.machine_name,
//             m.machine_plant,
//             m.machine_model,
//             m.machine_customer,
//             m.machine_location,
//             m.company_id,
//             COALESCE(ms.status_code, 2) AS machine_status  -- Default to Offline (2) if no data is found
//         FROM oee.oee_machine m
//         LEFT JOIN machine_status ms ON m.machine_id = ms.machine_id
//         WHERE m.company_id = $1;
//     `;

//     try {
//         const result = await db.query(query, [user.companyId]);

//         if (result.rows.length === 0) {
//             return res.status(404).json(encryptData({ error: 'No machines found for this company' }));
//         }

//         console.log(result.rows);
//         //res.status(200).json(encryptData(result.rows));
//         res.status(200).json(result.rows);
//     } catch (err) {
//         console.error('Error fetching machine data with status:', err);
//         res.status(500).json(encryptData({ error: 'Internal server error' }));
//     }
// }
async function machineDataWithDetailsAndStatus(req, res) {
    const user = req.user;

    // Security check to ensure the user is authenticated
    if (!user || !user.companyId) {
        return res.status(403).json(encryptData({ error: 'Unauthorized access. Invalid token.' }));
    }

    const query = `
        WITH machine_status AS (
            SELECT 
                dd.deviceuid AS machine_id,
                MAX(dd.timestamp) AS last_data_time,
                CASE 
                    WHEN MAX(dd.timestamp) < NOW() - INTERVAL '15 minutes' THEN 2  -- Offline
                    WHEN MAX((dd.data->>'MC_STATUS')::NUMERIC) = 0 THEN 0  -- Stopped
                    WHEN MAX((dd.data->>'MC_STATUS')::NUMERIC) = 1 AND MAX((dd.data->>'Act Speed')::NUMERIC) = 0 THEN 3  -- Idle
                    WHEN MAX((dd.data->>'MC_STATUS')::NUMERIC) = 1 
                         AND MAX((dd.data->>'Act Speed')::NUMERIC) < 0.5 * MAX((dd.data->>'Target Speed')::NUMERIC) THEN 4  -- Running Below Target Speed
                    WHEN MAX((dd.data->>'MC_STATUS')::NUMERIC) = 1 THEN 1  -- Running
                    ELSE 5  -- Unknown
                END AS status_code
            FROM oee.device_data dd
            WHERE dd.timestamp >= NOW() - INTERVAL '15 minutes'
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
            COALESCE(p.machine_image_path, '') AS model_data,
            COALESCE(ms.status_code, 2) AS machine_status  -- Default to Offline (2) if no data is found
        FROM oee.oee_machine m
        JOIN oee.oee_machine_type mt ON m.machine_type_id = mt.machine_type_id
        LEFT JOIN LATERAL (
            SELECT machine_image_path
            FROM oee.oee_machine_parts p
            WHERE p.machine_id = m.machine_uid
            ORDER BY p.machine_part_id ASC
            LIMIT 1
        ) p ON true
        LEFT JOIN machine_status ms ON m.machine_id = ms.machine_id
        WHERE m.company_id = $1;
    `;

    try {
        const result = await db.query(query, [user.companyId]);

        if (result.rows.length === 0) {
            return res.status(404).json(encryptData({ error: 'No machines found for this company' }));
        }

        //return res.status(200).json(encryptData(result.rows));
        return res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching machine data with status:', err);
        return res.status(500).json(encryptData({ error: 'Internal server error' }));
    }
}

async function machineProductionData(req, res) {
    const user = req.user;

    if (!user || !user.companyId) {
        return res.status(403).json(encryptData({ error: 'Unauthorized access. Invalid token.' }));
    }

    const query = `
        WITH month_data AS (
            SELECT 
                dd.deviceuid AS machine_id,
                DATE_TRUNC('month', dd.timestamp) AS month_start,
                MAX((dd.data->>'This Month Production')::NUMERIC) - MIN((dd.data->>'This Month Production')::NUMERIC) AS production_length
            FROM oee.device_data dd
            WHERE dd.timestamp >= TO_TIMESTAMP($1, 'YYYY-MM-DD HH24:MI:SS')
            AND dd.timestamp <= TO_TIMESTAMP($2, 'YYYY-MM-DD HH24:MI:SS')
            AND dd.data::jsonb ? 'This Month Production'
            GROUP BY dd.deviceuid, month_start
        ),

        reel_changes AS (
            SELECT 
                dd.deviceuid AS machine_id,
                dd.data->>'P_DT_BOBIN_FORMER_CHANGE' AS current_value,
                LAG(dd.data->>'P_DT_BOBIN_FORMER_CHANGE') OVER (PARTITION BY dd.deviceuid ORDER BY dd.timestamp) AS prev_value
            FROM oee.device_data dd
            WHERE dd.timestamp >= TO_TIMESTAMP($1, 'YYYY-MM-DD HH24:MI:SS')
            AND dd.timestamp <= TO_TIMESTAMP($2, 'YYYY-MM-DD HH24:MI:SS')
            AND dd.data::jsonb ? 'P_DT_BOBIN_FORMER_CHANGE'
        ),

        reel_transitions AS (
            SELECT 
                machine_id,
                COUNT(*) AS produced_reels
            FROM reel_changes
            WHERE prev_value = '0' AND current_value = '1'
            GROUP BY machine_id
        )

        SELECT 
            m.machine_uid,
            -- m.machine_id,
            -- m.machine_name,
            -- m.machine_plant,
            -- m.company_id,
            COALESCE(SUM(md.production_length), 0) AS produced_length,
            COALESCE(rt.produced_reels, 0) AS produced_reels
        FROM oee.oee_machine m
        LEFT JOIN month_data md ON m.machine_id = md.machine_id
        LEFT JOIN reel_transitions rt ON m.machine_id = rt.machine_id
        WHERE m.company_id = $3
        GROUP BY m.machine_uid, m.machine_id, m.machine_name, m.machine_plant, m.company_id, rt.produced_reels;
    `;

    try {
        const { start_date, end_date } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json(encryptData({ error: 'Missing start_date or end_date' }));
        }

        const result = await db.query(query, [start_date, end_date, user.companyId]);

        if (result.rows.length === 0) {
            return res.status(404).json(encryptData({ error: 'No production data found for this company' }));
        }

        return res.status(200).json(result.rows);
        //return res.status(200).json(encryptData(result.rows));
    } catch (err) {
        console.error('Error fetching machine production data:', err);
        return res.status(500).json(encryptData({ error: 'Internal server error' }));
    }
}

async function machineOEEForCompany(req, res) {
    const user = req.user;

    if (!user || !user.companyId) {
        return res.status(403).json(encryptData({ error: 'Unauthorized access. Invalid token.' }));
    }

    const query = ` WITH per_minute_stats AS (
                        SELECT
                            deviceUid AS machine_id,
                            TO_CHAR(DATE_TRUNC('minute', timestamp), 'HH24:MI') AS minute,
                            COUNT(*) AS data_points,
                            SUM(CASE WHEN (data->>'MC_STATUS')::numeric = 1 THEN 1 ELSE 0 END) AS uptime_points,
                            SUM(CASE WHEN (data->>'MC_STATUS')::numeric = 0 THEN 1 ELSE 0 END) AS downtime_points
                        FROM
                            oee.device_data
                        WHERE 
                            deviceUid IN (SELECT machine_id FROM oee.oee_machine WHERE company_id = $1)
                            AND data::jsonb ? 'MC_STATUS'
                            AND timestamp BETWEEN $2 AND $3
                        GROUP BY
                            deviceUid, DATE_TRUNC('minute', timestamp)
                        ),

                        availability AS (
                        SELECT
                            machine_id,
                            (SUM(uptime_points * 1.0 / data_points) / 
                            NULLIF(SUM(uptime_points * 1.0 / data_points) + SUM(downtime_points * 1.0 / data_points), 0)) * 100 AS total_uptime_percentage
                        FROM per_minute_stats
                        GROUP BY machine_id
                        ),

                        production_data AS (
                        SELECT 
                            deviceUid AS machine_id,
                            (data->>'LINE_SPEED')::numeric AS line_speed,
                            (data->>'ACT_COLD_DIA')::numeric AS diameter,
                            timestamp,
                            LEAD(timestamp) OVER (PARTITION BY deviceUid ORDER BY timestamp) AS next_timestamp
                        FROM oee.device_data
                        WHERE 
                            deviceUid IN (SELECT machine_id FROM oee.oee_machine WHERE company_id = $1)
                            AND data::jsonb ? 'LINE_SPEED'
                            AND timestamp BETWEEN $2 AND $3
                        ),

                        calculated_data AS (
                        SELECT 
                            machine_id,
                            line_speed,
                            diameter,
                            EXTRACT(EPOCH FROM (next_timestamp - timestamp)) / 60 AS time_diff_minutes
                        FROM production_data
                        WHERE next_timestamp IS NOT NULL
                        ),

                        actual_production_weight AS (
                        SELECT 
                            machine_id,
                            COALESCE(
                            SUM(
                                (3.14159 * ((diameter / 1000 / 2)^2) * 
                                time_diff_minutes * 
                                line_speed * 
                                7860) / 1000
                            ), 0
                            ) AS actual_weight
                        FROM calculated_data
                        GROUP BY machine_id
                        ),

                        per_minute_stats_for_performance AS (
                        SELECT
                            deviceUid AS machine_id,
                            TO_CHAR(DATE_TRUNC('day', timestamp), 'YYYY-MM-DD') AS date,
                            TO_CHAR(DATE_TRUNC('minute', timestamp), 'HH24:MI') AS minute,
                            COUNT(*) AS data_points,
                            SUM(CASE WHEN (data->>'MC_STATUS')::numeric = 1 THEN 1 ELSE 0 END) AS uptime_points,
                            EXTRACT(EPOCH FROM MAX(timestamp) - MIN(timestamp)) / 60 AS time_diff_minutes,
                            MAX((data->>'LINE_SPEED')::numeric) AS max_speed
                        FROM oee.device_data
                        WHERE 
                            deviceUid IN (SELECT machine_id FROM oee.oee_machine WHERE company_id = $1)
                            AND data::jsonb ? 'MC_STATUS'
                            AND data::jsonb ? 'LINE_SPEED'
                            AND timestamp BETWEEN $2 AND $3
                        GROUP BY deviceUid, DATE_TRUNC('day', timestamp), DATE_TRUNC('minute', timestamp)
                        ),

                        daily_max_speed AS (
                        SELECT
                            machine_id,
                            date,
                            MAX(max_speed) AS max_speed
                        FROM per_minute_stats_for_performance
                        GROUP BY machine_id, date
                        ),

                        target_length AS (
                        SELECT
                            pms.machine_id,
                            SUM(pms.uptime_points * 1.0 / pms.data_points * dms.max_speed * pms.time_diff_minutes) AS total_length
                        FROM per_minute_stats_for_performance pms
                        JOIN daily_max_speed dms ON pms.machine_id = dms.machine_id AND pms.date = dms.date
                        GROUP BY pms.machine_id
                        ),

                        target_production_weight AS (
                        SELECT
                            cl.machine_id,
                            COALESCE(
                            SUM(
                                (3.14159 * ((dia.diameter / 1000 / 2)^2) * 
                                cl.total_length * 
                                7860) / 1000
                            ), 0
                            ) AS target_weight
                        FROM target_length cl
                        JOIN (
                            SELECT DISTINCT deviceUid AS machine_id, (data->>'ACT_COLD_DIA')::numeric AS diameter
                            FROM oee.device_data
                            WHERE deviceUid IN (SELECT machine_id FROM oee.oee_machine WHERE company_id = $1)
                            AND data::jsonb ? 'ACT_COLD_DIA'
                            AND timestamp BETWEEN $2 AND $3
                        ) dia ON cl.machine_id = dia.machine_id
                        GROUP BY cl.machine_id
                        )

                        SELECT
                        m.machine_uid,
                        -- m.machine_id,
                        -- m.machine_name,
                        -- m.machine_plant,
                        COALESCE(a.total_uptime_percentage, 0) AS Availability,
                        COALESCE(apw.actual_weight, 0) AS actual_weight,
                        COALESCE(tpw.target_weight, 0) AS target_weight,
                        CASE 
                            WHEN COALESCE(tpw.target_weight, 0) = 0 THEN 0
                            ELSE (COALESCE(apw.actual_weight, 0) / COALESCE(tpw.target_weight, 0)) * 100 
                        END AS Performance,
                        CASE 
                            WHEN COALESCE(apw.actual_weight, 0) = 0 THEN 100
                            ELSE (COALESCE(apw.actual_weight, 0) / (COALESCE(apw.actual_weight, 0) + 0)) * 100  
                        END AS Quality,
                        CASE 
                            WHEN COALESCE(a.total_uptime_percentage, 0) = 0 OR (COALESCE(apw.actual_weight, 0) / COALESCE(tpw.target_weight, 0)) = 0 THEN 0
                            ELSE (COALESCE(a.total_uptime_percentage, 0) * (COALESCE(apw.actual_weight, 0) / COALESCE(tpw.target_weight, 0)) * 100) / 100
                        END AS OEE
                        FROM oee.oee_machine m
                        LEFT JOIN availability a ON m.machine_id = a.machine_id
                        LEFT JOIN actual_production_weight apw ON m.machine_id = apw.machine_id
                        LEFT JOIN target_production_weight tpw ON m.machine_id = tpw.machine_id
                        WHERE m.company_id = $1;
 `;

    try {
        const { start_date, end_date } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json(encryptData({ error: 'Missing start_date or end_date' }));
        }

        console.time("DB Query Execution");
        const result = await db.query(query, [user.companyId, start_date, end_date]);
        console.timeEnd("DB Query Execution");

        if (result.rows.length === 0) {
            return res.status(404).json(encryptData({ error: 'No data found for this company' }));
        }

        //return res.status(200).json(encryptData(result.rows));
        return res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching OEE data:', err);
        return res.status(500).json(encryptData({ error: 'Internal server error' }));
    }
}

async function machineCompleteData(req, res) {
    const user = req.user;

    if (!user || !user.companyId) {
        return res.status(403).json(encryptData({ error: 'Unauthorized access. Invalid token.' }));
    }

    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
        return res.status(400).json(encryptData({ error: 'Missing start_date or end_date' }));
    }

    // Define queries
    const machineDataQuery = `
        WITH machine_status AS (
            SELECT 
                dd.deviceuid AS machine_id,
                MAX(dd.timestamp) AS last_data_time,
                CASE 
                    WHEN MAX(dd.timestamp) < NOW() - INTERVAL '15 minutes' THEN 2  -- Offline
                    WHEN MAX((dd.data->>'MC_STATUS')::NUMERIC) = 0 THEN 0  -- Stopped
                    WHEN MAX((dd.data->>'MC_STATUS')::NUMERIC) = 1 AND MAX((dd.data->>'Act Speed')::NUMERIC) = 0 THEN 3  -- Idle
                    WHEN MAX((dd.data->>'MC_STATUS')::NUMERIC) = 1 
                         AND MAX((dd.data->>'Act Speed')::NUMERIC) < 0.5 * MAX((dd.data->>'Target Speed')::NUMERIC) THEN 4  -- Running Below Target Speed
                    WHEN MAX((dd.data->>'MC_STATUS')::NUMERIC) = 1 THEN 1  -- Running
                    ELSE 5  -- Unknown
                END AS status_code
            FROM oee.device_data dd
            WHERE dd.timestamp >= NOW() - INTERVAL '15 minutes'
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
            COALESCE(p.machine_image_path, '') AS model_data,
            COALESCE(ms.status_code, 2) AS machine_status  -- Default to Offline (2) if no data is found
        FROM oee.oee_machine m
        JOIN oee.oee_machine_type mt ON m.machine_type_id = mt.machine_type_id
        LEFT JOIN LATERAL (
            SELECT machine_image_path
            FROM oee.oee_machine_parts p
            WHERE p.machine_id = m.machine_uid
            ORDER BY p.machine_part_id ASC
            LIMIT 1
        ) p ON true
        LEFT JOIN machine_status ms ON m.machine_id = ms.machine_id
        WHERE m.company_id = $1;
    `;

    const productionDataQuery = `
        WITH month_data AS (
            SELECT 
                dd.deviceuid AS machine_id,
                DATE_TRUNC('month', dd.timestamp) AS month_start,
                MAX((dd.data->>'This Month Production')::NUMERIC) - MIN((dd.data->>'This Month Production')::NUMERIC) AS production_length
            FROM oee.device_data dd
            WHERE dd.timestamp >= TO_TIMESTAMP($1, 'YYYY-MM-DD HH24:MI:SS')
            AND dd.timestamp <= TO_TIMESTAMP($2, 'YYYY-MM-DD HH24:MI:SS')
            AND dd.data::jsonb ? 'This Month Production'
            GROUP BY dd.deviceuid, month_start
        ),

        reel_changes AS (
            SELECT 
                dd.deviceuid AS machine_id,
                dd.data->>'P_DT_BOBIN_FORMER_CHANGE' AS current_value,
                LAG(dd.data->>'P_DT_BOBIN_FORMER_CHANGE') OVER (PARTITION BY dd.deviceuid ORDER BY dd.timestamp) AS prev_value
            FROM oee.device_data dd
            WHERE dd.timestamp >= TO_TIMESTAMP($1, 'YYYY-MM-DD HH24:MI:SS')
            AND dd.timestamp <= TO_TIMESTAMP($2, 'YYYY-MM-DD HH24:MI:SS')
            AND dd.data::jsonb ? 'P_DT_BOBIN_FORMER_CHANGE'
        ),

        reel_transitions AS (
            SELECT 
                machine_id,
                COUNT(*) AS produced_reels
            FROM reel_changes
            WHERE prev_value = '0' AND current_value = '1'
            GROUP BY machine_id
        )

        SELECT 
            m.machine_uid,
            -- m.machine_id,
            -- m.machine_name,
            -- m.machine_plant,
            -- m.company_id,
            COALESCE(SUM(md.production_length), 0) AS produced_length,
            COALESCE(rt.produced_reels, 0) AS produced_reels
        FROM oee.oee_machine m
        LEFT JOIN month_data md ON m.machine_id = md.machine_id
        LEFT JOIN reel_transitions rt ON m.machine_id = rt.machine_id
        WHERE m.company_id = $3
        GROUP BY m.machine_uid, m.machine_id, m.machine_name, m.machine_plant, m.company_id, rt.produced_reels;
    `;

    const oeeDataQuery = `
        WITH per_minute_stats AS (
            SELECT
                deviceUid AS machine_id,
                TO_CHAR(DATE_TRUNC('minute', timestamp), 'HH24:MI') AS minute,
                COUNT(*) AS data_points,
                SUM(CASE WHEN (data->>'MC_STATUS')::numeric = 1 THEN 1 ELSE 0 END) AS uptime_points,
                SUM(CASE WHEN (data->>'MC_STATUS')::numeric = 0 THEN 1 ELSE 0 END) AS downtime_points
            FROM
                oee.device_data
            WHERE 
                deviceUid IN (SELECT machine_id FROM oee.oee_machine WHERE company_id = $1)
                AND data::jsonb ? 'MC_STATUS'
                AND timestamp BETWEEN $2 AND $3
            GROUP BY
                deviceUid, DATE_TRUNC('minute', timestamp)
            ),

            availability AS (
            SELECT
                machine_id,
                (SUM(uptime_points * 1.0 / data_points) / 
                NULLIF(SUM(uptime_points * 1.0 / data_points) + SUM(downtime_points * 1.0 / data_points), 0)) * 100 AS total_uptime_percentage
            FROM per_minute_stats
            GROUP BY machine_id
            ),

            production_data AS (
            SELECT 
                deviceUid AS machine_id,
                (data->>'LINE_SPEED')::numeric AS line_speed,
                (data->>'ACT_COLD_DIA')::numeric AS diameter,
                timestamp,
                LEAD(timestamp) OVER (PARTITION BY deviceUid ORDER BY timestamp) AS next_timestamp
            FROM oee.device_data
            WHERE 
                deviceUid IN (SELECT machine_id FROM oee.oee_machine WHERE company_id = $1)
                AND data::jsonb ? 'LINE_SPEED'
                AND timestamp BETWEEN $2 AND $3
            ),

            calculated_data AS (
            SELECT 
                machine_id,
                line_speed,
                diameter,
                EXTRACT(EPOCH FROM (next_timestamp - timestamp)) / 60 AS time_diff_minutes
            FROM production_data
            WHERE next_timestamp IS NOT NULL
            ),

            actual_production_weight AS (
            SELECT 
                machine_id,
                COALESCE(
                SUM(
                    (3.14159 * ((diameter / 1000 / 2)^2) * 
                    time_diff_minutes * 
                    line_speed * 
                    7860) / 1000
                ), 0
                ) AS actual_weight
            FROM calculated_data
            GROUP BY machine_id
            ),

            per_minute_stats_for_performance AS (
            SELECT
                deviceUid AS machine_id,
                TO_CHAR(DATE_TRUNC('day', timestamp), 'YYYY-MM-DD') AS date,
                TO_CHAR(DATE_TRUNC('minute', timestamp), 'HH24:MI') AS minute,
                COUNT(*) AS data_points,
                SUM(CASE WHEN (data->>'MC_STATUS')::numeric = 1 THEN 1 ELSE 0 END) AS uptime_points,
                EXTRACT(EPOCH FROM MAX(timestamp) - MIN(timestamp)) / 60 AS time_diff_minutes,
                MAX((data->>'LINE_SPEED')::numeric) AS max_speed
            FROM oee.device_data
            WHERE 
                deviceUid IN (SELECT machine_id FROM oee.oee_machine WHERE company_id = $1)
                AND data::jsonb ? 'MC_STATUS'
                AND data::jsonb ? 'LINE_SPEED'
                AND timestamp BETWEEN $2 AND $3
            GROUP BY deviceUid, DATE_TRUNC('day', timestamp), DATE_TRUNC('minute', timestamp)
            ),

            daily_max_speed AS (
            SELECT
                machine_id,
                date,
                MAX(max_speed) AS max_speed
            FROM per_minute_stats_for_performance
            GROUP BY machine_id, date
            ),

            target_length AS (
            SELECT
                pms.machine_id,
                SUM(pms.uptime_points * 1.0 / pms.data_points * dms.max_speed * pms.time_diff_minutes) AS total_length
            FROM per_minute_stats_for_performance pms
            JOIN daily_max_speed dms ON pms.machine_id = dms.machine_id AND pms.date = dms.date
            GROUP BY pms.machine_id
            ),

            target_production_weight AS (
            SELECT
                cl.machine_id,
                COALESCE(
                SUM(
                    (3.14159 * ((dia.diameter / 1000 / 2)^2) * 
                    cl.total_length * 
                    7860) / 1000
                ), 0
                ) AS target_weight
            FROM target_length cl
            JOIN (
                SELECT DISTINCT deviceUid AS machine_id, (data->>'ACT_COLD_DIA')::numeric AS diameter
                FROM oee.device_data
                WHERE deviceUid IN (SELECT machine_id FROM oee.oee_machine WHERE company_id = $1)
                AND data::jsonb ? 'ACT_COLD_DIA'
                AND timestamp BETWEEN $2 AND $3
            ) dia ON cl.machine_id = dia.machine_id
            GROUP BY cl.machine_id
            )

            SELECT
            m.machine_uid,
            -- m.machine_id,
            -- m.machine_name,
            -- m.machine_plant,
            COALESCE(a.total_uptime_percentage, 0) AS Availability,
            COALESCE(apw.actual_weight, 0) AS actual_weight,
            COALESCE(tpw.target_weight, 0) AS target_weight,
            CASE 
                WHEN COALESCE(tpw.target_weight, 0) = 0 THEN 0
                ELSE (COALESCE(apw.actual_weight, 0) / COALESCE(tpw.target_weight, 0)) * 100 
            END AS Performance,
            CASE 
                WHEN COALESCE(apw.actual_weight, 0) = 0 THEN 100
                ELSE (COALESCE(apw.actual_weight, 0) / (COALESCE(apw.actual_weight, 0) + 0)) * 100  
            END AS Quality,
            CASE 
                WHEN COALESCE(a.total_uptime_percentage, 0) = 0 OR (COALESCE(apw.actual_weight, 0) / COALESCE(tpw.target_weight, 0)) = 0 THEN 0
                ELSE (COALESCE(a.total_uptime_percentage, 0) * (COALESCE(apw.actual_weight, 0) / COALESCE(tpw.target_weight, 0)) * 100) / 100
            END AS OEE
            FROM oee.oee_machine m
            LEFT JOIN availability a ON m.machine_id = a.machine_id
            LEFT JOIN actual_production_weight apw ON m.machine_id = apw.machine_id
            LEFT JOIN target_production_weight tpw ON m.machine_id = tpw.machine_id
            WHERE m.company_id = $1;
    `;

    try {
        console.time("DB Query Execution");

        // Run all queries in parallel
        const [machineDataResult, productionDataResult, oeeDataResult] = await Promise.all([
            db.query(machineDataQuery, [user.companyId]),
            db.query(productionDataQuery, [start_date, end_date, user.companyId]),
            db.query(oeeDataQuery, [user.companyId, start_date, end_date])
        ]);

        console.timeEnd("DB Query Execution");

        // Map data by machine UID
        let machineDataMap = {};

        // Process Machine Data
        machineDataResult.rows.forEach(machine => {
            machineDataMap[machine.machine_uid] = {
                machineData: machine,
                productionData: {},
                oeeData: {}
            };
        });

        // Process Production Data
        productionDataResult.rows.forEach(production => {
            if (machineDataMap[production.machine_uid]) {
                machineDataMap[production.machine_uid].productionData = production;
            }
        });

        // Process OEE Data
        oeeDataResult.rows.forEach(oee => {
            if (machineDataMap[oee.machine_uid]) {
                machineDataMap[oee.machine_uid].oeeData = oee;
            }
        });

        if (Object.keys(machineDataMap).length === 0) {
            return res.status(404).json(encryptData({ error: 'No data found for this company' }));
        }

        return res.status(200).json(encryptData(machineDataMap));
        //return res.status(200).json(machineDataMap);

    } catch (err) {
        console.error('Error fetching complete machine data:', err);
        return res.status(500).json(encryptData({ error: 'Internal server error' }));
    }
}


module.exports = {
    getMachineName,
    machineDataWithDetailsAndStatus,
    machineProductionData,
    machineOEEForCompany,
    machineCompleteData
}