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
router.get('/single_machine_data/:machine_id', admin.getMachineName);

// oee
router.get('/device_data/:device_id/:start_date/:end_date', admin.dataByDeviceId);

//planning calendar
router.get('/get_shifts/:company_id', admin.getShifts);
router.delete('/delete_shift/:shift_id', admin.deleteShift);
router.post('/add_shift', admin.addShift);

module.exports = router;
