const jwt = require('jsonwebtoken');
require('dotenv').config();

const secretKey = process.env.JWT_SECRET_KEY || 'default-secret-key';

function generateToken(payload, options = {}) {
  const defaultOptions = { expiresIn: '1h', algorithm: 'HS256' };
  return jwt.sign(payload, secretKey, { ...defaultOptions, ...options });
}

function verifyToken(token) {
  return new Promise((resolve, reject) => {
    try {
      const decoded = jwt.verify(token, secretKey);
      resolve(decoded);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        reject(new Error('Token has expired'));
      } else if (error.name === 'JsonWebTokenError') {
        reject(new Error('Invalid token'));
      } else {
        reject(new Error('Token verification failed'));
      }
    }
  });
}

function refreshToken(token) {
  return new Promise((resolve, reject) => {
    try {
      const payload = jwt.verify(token, secretKey, { ignoreExpiration: true });

      delete payload.iat;
      delete payload.exp;

      const newToken = generateToken(payload);
      resolve(newToken);
    } catch (error) {
      reject(new Error('Token refresh failed'));
    }
  });
}

function authenticateUser(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Authorization token is required' });
  }

  verifyToken(token)
    .then((decoded) => {
      req.user = decoded;
      next();
    })
    .catch((err) => {
      return res.status(401).json({ message: err.message });
    });
}

module.exports = { generateToken, verifyToken, refreshToken, authenticateUser };
