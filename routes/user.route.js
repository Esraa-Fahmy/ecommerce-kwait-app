const express = require('express');
const { getUsers, uploadUserImage, resizeImage, createUser, getUserById, updateUser, deleteUser, getLoggedUserAccount, updateLoggedUserPassword, updateLoggedUserData, deleteLoggedUserAccount, getAppStats } = require('../controllers/user.controller');
const { createUserValidator, getUserValidator, updateUserValidator, deleteUserValidator, changeAccountPasswordValidator, updateLoggedUserDataValidator } = require('../validators/user.validation');


const Auth = require('../controllers/auth.controller')


const router = express.Router();


router.use(Auth.protect);

//User Account
router.get('/getMe' , getLoggedUserAccount, getUserById)
router.put('/changeMyPasswordAccount', changeAccountPasswordValidator, updateLoggedUserPassword)
router.put('/updateMyData',  uploadUserImage, resizeImage, updateLoggedUserDataValidator, updateLoggedUserData)
router.delete('/deleteMyAcc', deleteLoggedUserAccount)







// admin
router.route('/')
.get( Auth.allowedTo('admin'), getUsers)
.post( Auth.allowedTo('admin'), uploadUserImage, resizeImage, createUserValidator, createUser);
router.route('/:id')
.get( Auth.allowedTo('admin'), getUserValidator, getUserById)
.put( Auth.allowedTo('admin'), uploadUserImage, resizeImage, updateUserValidator , updateUser)
.delete( Auth.allowedTo('admin'), deleteUserValidator, deleteUser);
router.get("/stats", Auth.allowedTo("admin"), getAppStats);


module.exports = router;  