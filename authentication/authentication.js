const bcrypt = require('bcrypt');
const db = require('../db');
const jwtUtils = require('../token/jwtUtils');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { v4: uuidv4 } = require('uuid');

async function register(req, res) {
    const {
        FirstName,
        LastName,
        PersonalEmail,
        Designation,
        CompanyName,
        CompanyEmail,
        ContactNO,
        Location,
        Password
    } = req.body;

    const user_id = uuidv4();
    const company_id = uuidv4();
    const password_hash = await bcrypt.hash(Password, 10);

    const client = await db.connect();

    try {
        await client.query('BEGIN');

        const AddCompanyQuery = `
            INSERT INTO oee.oee_company_info (company_id, company_name, company_email, contact_no, location) 
            VALUES($1, $2, $3, $4, $5);
        `;
        await client.query(AddCompanyQuery, [company_id, CompanyName, CompanyEmail, ContactNO, Location]);

        const CheckUserExistQuery = `SELECT * FROM oee.oee_user_info WHERE personal_email = $1;`;
        const userResult = await client.query(CheckUserExistQuery, [PersonalEmail]);

        if (userResult.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ message: 'User Already Exists!' });
        }

        const InsertUserQuery = `
            INSERT INTO oee.oee_user_info 
            (user_id, first_name, last_name, personal_email, designation, company_id, password, verified, block) 
            VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9);
        `;
        await client.query(InsertUserQuery, [
            user_id, FirstName, LastName, PersonalEmail, Designation, company_id, password_hash, null, null
        ]);

        await client.query('COMMIT');
        res.status(201).json({ message: 'User registered successfully' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error during registration:', error);
        res.status(500).json({ message: 'Internal server error' });

    } finally {
        client.release();
    }
}

module.exports = {
    register
};