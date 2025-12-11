const { check } = require('express-validator');
const validatorMiddleware = require('../middlewares/validatorMiddleware');

exports.createRatingValidator = [
  // Rating field validation
  check('rating')
    .notEmpty()
    .withMessage('قيمة التقييم مطلوبة')
    .isFloat({ min: 1, max: 5 })
    .withMessage('يجب أن تكون قيمة التقييم بين 1 و 5'),

  // Comment field validation
  check('comment')
    .optional()
    .isLength({ min: 3 })
    .withMessage('يجب أن يكون التعليق 3 أحرف على الأقل'),

  validatorMiddleware, 
];