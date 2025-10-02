const validatorMiddleware = require('../middlewares/validatorMiddleware');
const User = require('../models/user.model');
const { check, body } = require("express-validator");
const bcrypt = require('bcrypt');

exports.createUserValidator = [
  check('firstName')
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ min: 2 })
    .withMessage('Too short first name'),

  check('lastName')
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ min: 2 })
    .withMessage('Too short last name'),

  check('email')
    .notEmpty()
    .withMessage('Email required')
    .isEmail()
    .withMessage('Invalid email address')
    .custom((val) =>
      User.findOne({ email: val }).then((user) => {
        if (user) {
          return Promise.reject(new Error('E-mail already in use'));
        }
      })
    ),

  check('password')
    .notEmpty()
    .withMessage('Password required')
    .isLength({ min: 4 })
    .withMessage('Password must be at least 4 characters')
    .custom((password, { req }) => {
      if (password !== req.body.passwordConfirm) {
        throw new Error('Password Confirmation incorrect');
      }
      return true;
    }),

  check('passwordConfirm')
    .notEmpty()
    .withMessage('Password confirmation required'),

  check('phone')
    .optional()
    .isMobilePhone(['ar-EG', 'ar-SA'])
    .withMessage('Invalid phone number; only Egy and SA numbers accepted'),

  check('profileImg').optional(),
  check('role').optional(),

  validatorMiddleware,
];

exports.getUserValidator = [
  check('id').isMongoId().withMessage('Invalid User id format'),
  validatorMiddleware,
];

exports.updateUserValidator = [
  check('id').isMongoId().withMessage('Invalid User id format'),

  check('email')
    .optional()
    .isEmail()
    .withMessage('Invalid email address')
    .custom((val) =>
      User.findOne({ email: val }).then((user) => {
        if (user) {
          return Promise.reject(new Error('E-mail already in use'));
        }
      })
    ),

 check('phone')
  .optional(),

  check('profileImg').optional(),
  check('role').optional(),

  validatorMiddleware,
];

exports.deleteUserValidator = [
  check('id').isMongoId().withMessage('Invalid User id format'),
  validatorMiddleware,
];

exports.changeAccountPasswordValidator = [
  body('currentPassword')
    .notEmpty()
    .withMessage('You must enter your current password'),

  body('passwordConfirm')
    .notEmpty()
    .withMessage('You must enter the password confirm'),

  body('password')
    .notEmpty()
    .withMessage('You must enter new password')
    .custom(async (val, { req }) => {
      const user = await User.findById(req.user._id).select('+password');
      if (!user) {
        throw new Error('User not found');
      }
      const isCorrectPassword = await bcrypt.compare(
        req.body.currentPassword,
        user.password
      );
      if (!isCorrectPassword) {
        throw new Error('Incorrect current password');
      }

      if (val !== req.body.passwordConfirm) {
        throw new Error('Password confirmation does not match');
      }
      return true;
    }),

  validatorMiddleware,
];

exports.updateLoggedUserDataValidator = [
  check('email')
    .optional()
    .notEmpty()
    .withMessage('Email required')
    .isEmail()
    .withMessage('Invalid email address')
    .custom((val) =>
      User.findOne({ email: val }).then((user) => {
        if (user) {
          return Promise.reject(new Error('E-mail already in use'));
        }
      })
    ),

 check('phone')
  .optional()
,
  check('profileImg')
    .optional()
    .isString()
    .withMessage('Profile image must be a string (filename)'),

  validatorMiddleware,
];
