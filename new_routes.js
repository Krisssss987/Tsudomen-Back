const express = require('express');
const auth = require('./authentication/authentication')
const admin = require('./admin/New_admin')
const data = require('./admin/data')
const router = express.Router();
const { authenticateUser } = require('./token/jwtUtils');

// Authentication API's for the Login and other Purpose
router.post('/register', auth.register);
router.post('/verify', auth.verifyToken);
router.post('/login', auth.loginUser);
router.get('/user', auth.getUserDetails);
router.post('/re-verify-mail', auth.resendToken);
router.post('/forgot', auth.forgotPassword);
router.post('/resend-forgot', auth.resendResetToken);
router.post('/reset-password', auth.resetPassword);


// Recovered Apis with All kind of Security Implemented
router.get('/single_machine_data/:machine_id', authenticateUser, admin.getMachineName);
router.get('/machineDataWithDetailsAndStatus', authenticateUser, admin.machineDataWithDetailsAndStatus);
router.get('/machineProductionData', authenticateUser, admin.machineProductionData);
router.get('/machineOEEForCompany', authenticateUser, admin.machineOEEForCompany);

router.get('/machineCompleteData', authenticateUser, admin.machineCompleteData);
router.get('/machineOEEForDevice/:deviceUid', authenticateUser, admin.machineOEEForDevice);
router.get('/machineOEEAggregation/:deviceUid', authenticateUser, admin.machineOEEAggregation);
router.get('/machineOEEForDeviceIntervalBased/:deviceUid', authenticateUser, admin.machineOEEForDeviceIntervalBased);


module.exports = router;
