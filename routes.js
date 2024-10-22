const express = require('express');
const auth = require('./authentication/authentication')
const router = express.Router();

// authentication
router.post('/register', auth.register); 
router.post('/verify', auth.verifyToken);
router.post('/login', auth.loginUser);
router.get('/user', auth.getUserDetails);  //unchecked
router.post('/re-verify-mail', auth.resendToken);
router.post('/forgot', auth.forgotPassword);
router.post('/resend-forgot', auth.resendResetToken);
router.post('/reset-password', auth.resetPassword);

module.exports = router;
