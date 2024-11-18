const express = require('express');
const auth = require('./authentication/authentication')
const admin = require('./admin/admin')
const router = express.Router();

// authentication
router.post('/register', auth.register); 
router.post('/verify', auth.verifyToken);
router.post('/login', auth.loginUser);
router.get('/user', auth.getUserDetails);
router.post('/re-verify-mail', auth.resendToken);
router.post('/forgot', auth.forgotPassword);
router.post('/resend-forgot', auth.resendResetToken);
router.post('/reset-password', auth.resetPassword);

// admin
router.get('/machine_data/:company_id/:start_date/:end_date', admin.machineByCompanyId);

module.exports = router;
