const { check } = require('express-validator');
const validatorMiddleware = require('../middlewares/validatorMiddleware');
const User = require('../models/user.model');

exports.signupValidator = [
  check('firstName')
  .notEmpty()
  .withMessage('الاسم الأول مطلوب')
  .isLength({ min: 2 })
  .withMessage('الاسم الأول قصير جداً'),

check('lastName')
  .notEmpty()
  .withMessage('الاسم الأخير مطلوب')
  .isLength({ min: 2 })
  .withMessage('الاسم الأخير قصير جداً'),

    

  check('email')
    .notEmpty()
    .withMessage('البريد الإلكتروني مطلوب')
    .isEmail()
    .withMessage('عنوان البريد الإلكتروني غير صالح')
    .custom((val) =>
      User.findOne({ email: val }).then((user) => {
        if (user) {
          return Promise.reject(new Error('البريد الإلكتروني مستخدم بالفعل'));
        }
      })
    ),

 check('phone')
  .optional(),


  check('password')
    .notEmpty()
    .withMessage('كلمة المرور مطلوبة')
   .isLength({ min: 4 })
    .withMessage('يجب أن تكون كلمة المرور 4 أحرف على الأقل')
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*._-])/)
  .withMessage('يجب أن تحتوي كلمة المرور على حرف كبير واحد على الأقل، وحرف صغير، ورقم، وحرف خاص (!@#$%^&*._-)')
    .custom((password, { req }) => {
      if (password !== req.body.passwordConfirm) {
        throw new Error('تأكيد كلمة المرور غير صحيح');
      }
      return true;
    }),

  check('passwordConfirm')
    .notEmpty()
    .withMessage('تأكيد كلمة المرور مطلوب'),

  validatorMiddleware,
];



exports.loginValidator = [
    check('email')
      .notEmpty()
      .withMessage('البريد الإلكتروني مطلوب')
      .isEmail()
      .withMessage('عنوان البريد الإلكتروني غير صالح'),
    check('password')
      .notEmpty()
      .withMessage('كلمة المرور مطلوبة'),

    validatorMiddleware,
  ];