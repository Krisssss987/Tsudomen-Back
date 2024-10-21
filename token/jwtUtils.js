const jwt = require('jsonwebtoken');
require('dotenv').config();
const secretKey = process.env.jwt;

// Generate a JWT token
function generateToken(payload) {
  return jwt.sign(payload, secretKey, { expiresIn: '1h' });
}

// Verify and decode a JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, secretKey);
  } catch (error) {
    return null;
  }
}

module.exports = { generateToken, verifyToken };