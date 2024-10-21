const express = require('express');
const auth = require('./authentication/authentication')
const router = express.Router();

router.post('/register', auth.register); 

module.exports = router;
