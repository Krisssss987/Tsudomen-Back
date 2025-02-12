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




module.exports = {
    getMachineName,
    machineDataWithDetailsAndStatus,
    machineProductionData
}