const db = require('../db');

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


module.exports = {
    edit_user,
    change_password,
    update_company_info
}