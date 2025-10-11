const { check } = require('express-validator');
const validatorMiddleware = require('../middlewares/validatorMiddleware');

exports.createRatingValidator = [
  // Rating field validation
  check('rating')
    .notEmpty()
    .withMessage('Rating value is required')
    .isFloat({ min: 1, max: 5 })
    .withMessage('Rating value must be between 1 and 5'),

  // Comment field validation
  check('comment')
    .optional()
    .isLength({ min: 3 })
    .withMessage('Comment must be at least 3 characters long'),

  validatorMiddleware, 
];