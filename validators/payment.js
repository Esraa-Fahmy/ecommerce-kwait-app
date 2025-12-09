const { check } = require('express-validator');
const validatorMiddleware = require('../middlewares/validatorMiddleware');

// ✅ Initiate Payment Validator
exports.initiatePaymentValidator = [
  check('orderId')
    .notEmpty()
    .withMessage('Order ID is required')
    .isMongoId()
    .withMessage('Invalid Order ID format'),
  
  check('paymentMethodId')
    .notEmpty()
    .withMessage('Payment method ID is required')
    .isInt({ min: 1 })
    .withMessage('Payment method ID must be a positive integer'),
  
  validatorMiddleware,
];

// ✅ Refund Payment Validator
exports.refundPaymentValidator = [
  check('orderId')
    .notEmpty()
    .withMessage('Order ID is required')
    .isMongoId()
    .withMessage('Invalid Order ID format'),
  
  check('reason')
    .optional()
    .isString()
    .withMessage('Reason must be a string')
    .isLength({ max: 500 })
    .withMessage('Reason must not exceed 500 characters'),
  
  validatorMiddleware,
];

// ✅ Check Payment Status Validator
exports.checkPaymentStatusValidator = [
  check('invoiceId')
    .notEmpty()
    .withMessage('Invoice ID is required')
    .isNumeric()
    .withMessage('Invoice ID must be numeric'),
  
  validatorMiddleware,
];