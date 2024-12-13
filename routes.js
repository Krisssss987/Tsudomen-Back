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
router.get('/machine_data_first/:company_id', admin.machineByCompanyIdFirst);
router.get('/single_machine_data/:machine_id', admin.getMachineName);

// oee
router.get('/device_data/:device_id/:start_date/:end_date', admin.dataByDeviceId);

//planning calendar
router.get('/get_shifts/:company_id', admin.getShifts);

router.delete('/delete_shift/:shift_id', admin.deleteShift);
router.put('/edit_shift/:shift_id', admin.edit_shift);
router.post('/add_shift', admin.addShift);

router.delete('/delete_holiday/:shift_id', admin.deleteHoliday);
router.put('/edit_holiday/:shift_id', admin.updateHoliday);
router.post('/add_holiday', admin.addHoliday);

// Technical Support
router.post('/make_request', admin.makeRequest);
router.get('/get_user_details/:user_id', admin.getUserWithCompanyData);

// breakdowns
router.get('/breakdowns/:machine_uid/:start_time/:end_time', admin.getBreakdowns);


module.exports = router;
