const bcrypt = require('bcrypt');
const db = require('../db');
const jwtUtils = require('../token/jwtUtils');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const ejs = require('ejs');
const { v4: uuidv4 } = require('uuid');


async function sendTokenEmail(email, token) {
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: 'kpohekar19@gmail.com',
        pass: 'woptjevenzhqmrpp'
      },
    });

    const templatePath = path.join(__dirname, '../mail-body/email-template.ejs');
    const templateData = await fs.readFile(templatePath, 'utf8');

    const compiledTemplate = ejs.compile(templateData);
    const html = compiledTemplate({ token });

    const mailOptions = {
      from: process.env.mailid,
      to: email,
      subject: 'Registration Token',
      html: html,
    };

    await transporter.sendMail(mailOptions);

  } catch (error) {
    console.error('Error sending email:', error);
  }
}

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
    const verificationToken = jwtUtils.generateToken({ personalemail: PersonalEmail });

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
            (user_id, first_name, last_name, personal_email, designation, company_id, password, verified, block, verification_token) 
            VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);
        `;
        await client.query(InsertUserQuery, [
            user_id, FirstName, LastName, PersonalEmail, Designation, company_id, password_hash, 0, 0, verificationToken
        ]);

        await client.query('COMMIT');

        sendTokenEmail(PersonalEmail, verificationToken);

        res.status(201).json({ message: 'User registered successfully' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error during registration:', error);
        res.status(500).json({ message: 'Internal server error' });

    } finally {
        client.release();
    }
}

async function verifyToken(req, res) {
    const { token } = req.body;
  
    const tokenCheckQuery = 'SELECT * FROM oee.oee_user_info WHERE verification_token = $1';
  
    try {
      const tokenCheckResult = await db.query(tokenCheckQuery, [token]);
  
      if (tokenCheckResult.rows.length === 0) {
        console.log('Token verification failed');
        return res.status(400).json({ message: 'Token verification failed' });
      }
  
      const updateQuery = 'UPDATE oee.oee_user_info SET verified = $1 WHERE verification_token = $2';
      await db.query(updateQuery, [1, token]);
  
      console.log('Token verification successful');
      res.json({ message: 'Token verification successful. You can now log in.' });
    } catch (error) {
      console.error('Error during token verification:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
}

async function loginUser(req, res) {
  const { Username, Password } = req.body;
  const checkUserNameQuery = `SELECT * FROM oee.oee_user_info WHERE "personal_email" = $1`;

  try {
    const checkUserNameResult = await db.query(checkUserNameQuery, [Username]);

    if (checkUserNameResult.rows.length === 0) {
      return res.status(401).json({ message: 'Username not found' });
    }

    const user = checkUserNameResult.rows[0];

    if (user.verified === 0) {
      return res.status(401).json({ message: 'User is not verified. Please verify your account.' });
    }

    if (user.block === 1) {
      return res.status(401).json({ message: 'User is blocked. Contact the Administrator.' });
    }

    const passwordCheckResult = await bcrypt.compare(Password, user.password);
    if (!passwordCheckResult) {
      return res.status(402).json({ message: 'Invalid credentials' });
    }

    const jwtToken = jwtUtils.generateToken({ userName: Username });
    res.status(200).json({ message: 'Login successful', token: jwtToken });

  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ message: 'Internal server error', error });
  }
}

async function getUserDetails(req, res) {
  try {
    if (!req.headers.authorization) {
      console.log('Authorization header missing');
      return res.status(401).json({ message: 'Authorization header missing' });
    }

    const token = req.headers.authorization.split(' ')[1];

    const decodedToken = jwtUtils.verifyToken(token);
    if (!decodedToken) {
      console.log('Invalid Token');
      return res.status(401).json({ message: 'Invalid token' });
    }

    const fetchUserQuery = 'SELECT * FROM ems_schema.ems_user_info WHERE "personal_email" = $1';
    const fetchCompanyQuery = `SELECT * FROM oee.oee_company_info WHERE "company_id" = $1`;

    const userResult = await db.query(fetchUserQuery, [decodedToken.userName]);

    if (userResult.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userDetail = userResult.rows[0];

    const companyResult = await db.query(fetchCompanyQuery, [userDetail.companyId]);

    const companyDetails = companyResult.rows[0];

    return res.status(200).json({
      getUserDetails: userDetail,
      companyDetails: companyDetails,
    });
  } catch (error) {
    console.error('Error during fetching details:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}  

module.exports = {
    register,
    sendTokenEmail,
    verifyToken,
    loginUser,
    getUserDetails

};