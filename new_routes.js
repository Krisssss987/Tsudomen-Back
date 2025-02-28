const express = require('express');
const auth = require('./authentication/authentication')
const admin = require('./admin/New_admin')
const data = require('./admin/data')
const router = express.Router();
const { authenticateUser } = require('./token/jwtUtils');
const admin2 = require('./admin/admin')

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
router.get('/calculateProductionAndIdleTime/:deviceUid', authenticateUser, admin.calculateProductionAndIdleTime);

router.post('/add_notification_configuration', admin2.addNotificationConfiguration);
router.get('/get_notification_configurations/:machine_id', admin2.getNotificationConfigurations);
router.delete('/delete_notification_configurations/:config_id', admin2.deleteNotificationConfiguration);

module.exports = router;
