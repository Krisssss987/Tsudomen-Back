const db = require('../db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');

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
            FROM ems_schema.device_data dd
            WHERE dd.timestamp >= TO_TIMESTAMP($2, 'YYYY-MM-DD HH24:MI:SS')
            AND dd.timestamp <= TO_TIMESTAMP($3, 'YYYY-MM-DD HH24:MI:SS')
            GROUP BY dd.deviceuid, EXTRACT(YEAR FROM dd.timestamp), EXTRACT(MONTH FROM dd.timestamp)
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
                    FROM ems_schema.device_data dd
                    WHERE dd.deviceuid = m.machine_id
                    AND dd.timestamp >= NOW() - INTERVAL '15 minutes'
                    ORDER BY dd.timestamp DESC
                    LIMIT 1
                ), 
                2
            ) AS status,

            -- New produced_length column with monthly breakdown
            COALESCE(
                (
                    SELECT SUM(max_prod - min_prod)
                    FROM month_data md
                    WHERE md.machine_id = m.machine_id
                    AND md.year = EXTRACT(YEAR FROM CURRENT_DATE)
                    AND md.month BETWEEN EXTRACT(MONTH FROM TO_TIMESTAMP($2, 'YYYY-MM-DD HH24:MI:SS')) 
                                        AND EXTRACT(MONTH FROM TO_TIMESTAMP($3, 'YYYY-MM-DD HH24:MI:SS'))
                ),
                0
            ) AS produced_length

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


module.exports = {
    machineByCompanyId,

}