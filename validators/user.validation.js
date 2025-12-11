const validatorMiddleware = require('../middlewares/validatorMiddleware');
const User = require('../models/user.model');
const { check, body } = require("express-validator");
const bcrypt = require('bcrypt');

exports.createUserValidator = [
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

  check('password')
    .notEmpty()
    .withMessage('كلمة المرور مطلوبة')
    .isLength({ min: 4 })
    .withMessage('يجب أن تكون كلمة المرور 4 أحرف على الأقل')
    .custom((password, { req }) => {
      if (password !== req.body.passwordConfirm) {
        throw new Error('تأكيد كلمة المرور غير صحيح');
      }
      return true;
    }),

  check('passwordConfirm')
    .notEmpty()
    .withMessage('تأكيد كلمة المرور مطلوب'),

  check('phone')
    .optional()
    .isMobilePhone(['ar-EG', 'ar-SA'])
    .withMessage('رقم الهاتف غير صالح؛ نقبل فقط الأرقام المصرية والسعودية'),

  check('profileImg').optional(),
  
  check('role')
    .optional()
    .custom((val) => {
      if (val && val !== 'admin') {
        throw new Error('يمكنك فقط إنشاء مستخدمين مشرفين. يجب على المستخدمين العاديين التسجيل عبر /api/v1/auth/signup');
      }
      return true;
    }),

  validatorMiddleware,
];

exports.getUserValidator = [
  check('id').isMongoId().withMessage('صيغة معرف المستخدم غير صالحة'),
  validatorMiddleware,
];

exports.updateUserValidator = [
  check('id').isMongoId().withMessage('صيغة معرف المستخدم غير صالحة'),

  check('email')
    .optional()
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

  check('profileImg').optional(),
  check('role').optional(),

  validatorMiddleware,
];

exports.deleteUserValidator = [
  check('id').isMongoId().withMessage('صيغة معرف المستخدم غير صالحة'),
  validatorMiddleware,
];

exports.changeAccountPasswordValidator = [
  body('currentPassword')
    .notEmpty()
    .withMessage('يجب إدخال كلمة المرور الحالية'),

  body('passwordConfirm')
    .notEmpty()
    .withMessage('يجب إدخال تأكيد كلمة المرور'),

  body('password')
    .notEmpty()
    .withMessage('يجب إدخال كلمة المرور الجديدة')
    .custom(async (val, { req }) => {
      const user = await User.findById(req.user._id).select('+password');
      if (!user) {
        throw new Error('المستخدم غير موجود');
      }
      const isCorrectPassword = await bcrypt.compare(
        req.body.currentPassword,
        user.password
      );
      if (!isCorrectPassword) {
        throw new Error('كلمة المرور الحالية غير صحيحة');
      }

      if (val !== req.body.passwordConfirm) {
        throw new Error('تأكيد كلمة المرور لا يتطابق');
      }
      return true;
    }),

  validatorMiddleware,
];

exports.updateLoggedUserDataValidator = [
  check('email')
    .optional()
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
  .optional()
,
  check('profileImg')
    .optional()
    .isString()
    .withMessage('يجب أن تكون صورة الملف الشخصي نصًا (اسم الملف)'),

  validatorMiddleware,
];
