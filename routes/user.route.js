const express = require('express');
const { 
  getUsers, 
  uploadUserImage, 
  resizeImage, 
  createUser, 
  getUserById, 
  updateUser, 
  deleteUser, 
  getLoggedUserAccount, 
  updateLoggedUserPassword, 
  updateLoggedUserData, 
  deleteLoggedUserAccount, 
  getAppStats,
  updateFcmToken 
} = require('../controllers/user.controller');
const { 
  createUserValidator, 
  getUserValidator, 
  updateUserValidator, 
  deleteUserValidator, 
  changeAccountPasswordValidator, 
  updateLoggedUserDataValidator 
} = require('../validators/user.validation');

const Auth = require('../controllers/auth.controller');

const router = express.Router();

// Protect all routes after this middleware
router.use(Auth.protect);

// User Account (Logged User)
router.get('/getMe', getLoggedUserAccount, getUserById);
router.put('/changeMyPasswordAccount', changeAccountPasswordValidator, updateLoggedUserPassword);
router.put('/updateMyData', uploadUserImage, resizeImage, updateLoggedUserDataValidator, updateLoggedUserData);
router.put('/fcm-token', updateFcmToken); // ✅ New Endpoint for FCM Token
router.delete('/deleteMyAcc', deleteLoggedUserAccount);

// Admin Routes
router.use(Auth.allowedTo('admin'));

router.route('/')
  .get(getUsers)
  .post(uploadUserImage, resizeImage, createUserValidator, createUser);

router.get("/stats", getAppStats);

router.route('/:id')
  .get(getUserValidator, getUserById)
  .put(uploadUserImage, resizeImage, updateUserValidator, updateUser)
  .delete(deleteUserValidator, deleteUser);

module.exports = router;