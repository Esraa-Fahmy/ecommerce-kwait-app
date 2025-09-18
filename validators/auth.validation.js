const { check } = require('express-validator');
const validatorMiddleware = require('../middlewares/validatorMiddleware');
const User = require('../models/user.model');

exports.signupValidator = [
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
          return Promise.reject(new Error('E-mail already in user'));
        }
      })
    ),

    check('phone')
    .optional()
    .isMobilePhone(['ar-EG', 'ar-SA'])
    .withMessage('Invalid phone number only accepted Egy and SA Phone numbers'),

  check('password')
    .notEmpty()
    .withMessage('Password required')
   .isLength({ min: 4 })
    .withMessage('Password must be at least 4 characters')
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*._-])/)
  .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (!@#$%^&*._-)')
    .custom((password, { req }) => {
      if (password !== req.body.passwordConfirm) {
        throw new Error('Password Confirmation incorrect');
      }
      return true;
    }),

  check('passwordConfirm')
    .notEmpty()
    .withMessage('Password confirmation required'),

  validatorMiddleware,
];



exports.loginValidator = [
    check('email')
      .notEmpty()
      .withMessage('Email required')
      .isEmail()
      .withMessage('Invalid email address'),
  
    check('password')
      .notEmpty()
      .withMessage('Password required')
      .isLength({ min: 4 })
      .withMessage('Password must be at least 4 characters')
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*._-])/)
  .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (!@#$%^&*._-)'),
    validatorMiddleware,
  ];