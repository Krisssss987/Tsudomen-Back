const db = require('../db');
const { v4: uuidv4 } = require('uuid');

async function edit_user(req, res) {
  const user_id = req.params.user_id;
  const { first_name, last_name, designation } = req.body;

  const checkUserQuery = `SELECT * FROM oee.oee_user_info WHERE user_id = $1`;

  const editUserQuery = `
    UPDATE oee.oee_user_info 
    SET first_name = $2, 
        last_name = $3, 
        designation = $4
    WHERE user_id = $1`;

  db.query(checkUserQuery, [user_id], (checkError, checkResult) => {
    if (checkError) {
      return res.status(500).json({ message: 'Error while checking user', error: checkError });
    }

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'User Not Found' });
    } else {
      db.query(
        editUserQuery,
        [user_id, first_name, last_name, designation],
        (editError, editResult) => {
          if (editError) {
            return res.status(500).json({ message: 'Error updating user', error: editError });
          }
          return res.status(200).json({ message: 'User updated successfully' });
        }
      );
    }
  });
}

async function change_password(req, res) {
  const user_id = req.params.user_id;
  const { password } = req.body;

  const checkUserQuery = `SELECT * FROM oee.oee_user_info WHERE user_id = $1`;

  const updatePasswordQuery = `
    UPDATE oee.oee_user_info 
    SET password = $2
    WHERE user_id = $1`;

  db.query(checkUserQuery, [user_id], (checkError, checkResult) => {
    if (checkError) {
      return res.status(500).json({ message: 'Error while checking user', error: checkError });
    }

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'User Not Found' });
    } else {
      db.query(
        updatePasswordQuery,
        [user_id, password],
        (updateError, updateResult) => {
          if (updateError) {
            return res.status(500).json({ message: 'Error updating password', error: updateError });
          }
          return res.status(200).json({ message: 'Password updated successfully' });
        }
      );
    }
  });
}

async function update_company_info(req, res) {
  const company_id = req.params.company_id;
  const { location, contact_no } = req.body;

  const checkCompanyQuery = `SELECT * FROM oee.oee_company_info WHERE company_id = $1`;

  const updateCompanyQuery = `
    UPDATE oee.oee_company_info 
    SET location = $2, 
        contact_no = $3
    WHERE company_id = $1`;

  db.query(checkCompanyQuery, [company_id], (checkError, checkResult) => {
    if (checkError) {
      return res.status(500).json({ message: 'Error while checking company', error: checkError });
    }

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Company Not Found' });
    } else {
      db.query(
        updateCompanyQuery,
        [company_id, location, contact_no],
        (updateError, updateResult) => {
          if (updateError) {
            return res.status(500).json({ message: 'Error updating company info', error: updateError });
          }
          return res.status(200).json({ message: 'Company info updated successfully' });
        }
      );
    }
  });
}

async function addMachine(req, res) {
  const {
    machine_id,
    machine_name,
    machine_plant,
    machine_model,
    machine_customer,
    machine_location,
    machine_longitude,
    machine_latitude,
    machine_type_name,
    company_id,
    machine_image
  } = req.body;

  if (!machine_name || !machine_type_name || !company_id) {
    return res.status(400).json({ error: 'Machine name, machine type, and company ID are required' });
  }

  try {
    let machine_type_id;
    
    const typeQuery = 'SELECT machine_type_id FROM oee.oee_machine_type WHERE machine_type_name = $1';
    const typeResult = await db.query(typeQuery, [machine_type_name]);

    if (typeResult.rows.length > 0) {
      machine_type_id = typeResult.rows[0].machine_type_id;
    } else {
      machine_type_id = uuidv4();
      const insertTypeQuery = 'INSERT INTO oee.oee_machine_type (machine_type_id, machine_type_name) VALUES ($1, $2)';
      await db.query(insertTypeQuery, [machine_type_id, machine_type_name]);
    }

    const machine_uid = uuidv4();
    const insertMachineQuery = `
      INSERT INTO oee.oee_machine (
        machine_uid, machine_id, machine_name, machine_plant, machine_model,
        machine_customer, machine_location, machine_longitude, machine_latitude,
        machine_type_id, company_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *;
    `;

    const machineResult = await db.query(insertMachineQuery, [
      machine_uid,
      machine_id,
      machine_name,
      machine_plant,
      machine_model,
      machine_customer,
      machine_location,
      machine_longitude,
      machine_latitude,
      machine_type_id,
      company_id
    ]);

    if (machine_image) {
      const machine_part_id = uuidv4();
      const insertImageQuery = `
        INSERT INTO oee.oee_machine_parts (machine_part_id, machine_id, machine_image_path, machine_image_name)
        VALUES ($1, $2, $3, $4);
      `;
      await db.query(insertImageQuery, [
        machine_part_id,
        machine_uid,
        machine_image,
        `${machine_name}_image`
      ]);
    }

    res.status(201).json({
      message: 'Machine added successfully',
      machine_uid: machineResult.rows[0].machine_uid
    });
  } catch (err) {
    console.error('Error adding machine:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateMachine(req, res) {
  const { machine_uid } = req.params;
  const {
    machine_id,
    machine_name,
    machine_plant,
    machine_model,
    machine_customer,
    machine_location,
    machine_longitude,
    machine_latitude,
    machine_type_name,
    company_id,
    machine_image
  } = req.body;

  if (!machine_uid || !company_id) {
    return res.status(400).json({ error: 'Machine UID and company ID are required' });
  }

  try {
    let machine_type_id;
    
    // Check if machine type exists
    const typeQuery = 'SELECT machine_type_id FROM oee.oee_machine_type WHERE machine_type_name = $1';
    const typeResult = await db.query(typeQuery, [machine_type_name]);

    if (typeResult.rows.length > 0) {
      machine_type_id = typeResult.rows[0].machine_type_id;
    } else {
      // Insert new machine type
      machine_type_id = uuidv4();
      const insertTypeQuery = 'INSERT INTO oee.oee_machine_type (machine_type_id, machine_type_name) VALUES ($1, $2)';
      await db.query(insertTypeQuery, [machine_type_id, machine_type_name]);
    }

    const updateMachineQuery = `
      UPDATE oee.oee_machine
      SET machine_id = $2, machine_name = $3, machine_plant = $4, machine_model = $5,
          machine_customer = $6, machine_location = $7, machine_longitude = $8, machine_latitude = $9,
          machine_type_id = $10
      WHERE machine_uid = $1 AND company_id = $11
      RETURNING *;
    `;

    const updateResult = await db.query(updateMachineQuery, [
      machine_uid,
      machine_id,
      machine_name,
      machine_plant,
      machine_model,
      machine_customer,
      machine_location,
      machine_longitude,
      machine_latitude,
      machine_type_id,
      company_id
    ]);

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    if (machine_image) {
      const updateImageQuery = `
        UPDATE oee.oee_machine_parts
        SET machine_image_path = $1
        WHERE machine_id = $2;
      `;
      await db.query(updateImageQuery, [machine_image, machine_uid]);
    }

    res.status(200).json({
      message: 'Machine updated successfully',
      updatedMachine: updateResult.rows[0].machine_uid
    });
  } catch (err) {
    console.error('Error updating machine:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}


module.exports = {
    edit_user,
    change_password,
    update_company_info,
    addMachine,
    updateMachine
}