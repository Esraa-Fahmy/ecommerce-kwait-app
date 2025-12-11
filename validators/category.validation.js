const { check } = require('express-validator');
const validatorMiddleware = require('../middlewares/validatorMiddleware');

exports.getCategoryValidator = [
  check('id').isMongoId().withMessage('صيغة معرف الفئة غير صالحة'),
  validatorMiddleware,
];



exports.createCategoryValidation = [
  check('name')
  .notEmpty()
  .withMessage('اسم الفئة مطلوب')
  .isLength({ min : 3})
  .withMessage('اسم الفئة قصير جداً')
  .isLength({max: 40})
  .withMessage('اسم الفئة طويل جداً'),
 ]


exports.updateCategoryValidation = [
  check('id').isMongoId().withMessage('معرف الفئة غير صالح'),
  check('name').optional(),
check('image').optional(),
  validatorMiddleware
]

exports.deleteCategoryValidation = [
  check('id').isMongoId().withMessage('معرف الفئة غير صالح'),
  validatorMiddleware
]