const express = require('express');
const auth = require('./authentication/authentication')
const router = express.Router();

// authentication
router.post('/register', auth.register); 
router.post('/verify', auth.verifyToken);
router.post('/login', auth.loginUser);

module.exports = router;
