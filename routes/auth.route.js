const express = require('express');
const { signupValidator, loginValidator } = require('../validators/auth.validation');
const { signup, login, forgotPassword, verifyPassResetCode, resetPassword } = require('../controllers/auth.controller');



const router = express.Router();


router.route('/signup').post(signupValidator, signup);
router.route('/login').post(loginValidator, login);
router.route('/forgetPassword').post(forgotPassword);
router.route('/verifyResetCode').post(verifyPassResetCode);
router.route('/resetPassword').put(resetPassword);





module.exports = router;   