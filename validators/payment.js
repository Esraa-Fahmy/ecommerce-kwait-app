const { check } = require('express-validator');
const validatorMiddleware = require('../middlewares/validatorMiddleware');

// ✅ Initiate Payment Validator
exports.initiatePaymentValidator = [
  check('orderId')
    .notEmpty()
    .withMessage('معرف الطلب مطلوب')
    .isMongoId()
    .withMessage('صيغة معرف الطلب غير صالحة'),
  
  check('paymentMethodId')
    .notEmpty()
    .withMessage('معرف طريقة الدفع مطلوب')
    .isInt({ min: 1 })
    .withMessage('يجب أن يكون معرف طريقة الدفع رقمًا صحيحًا موجبًا'),
  
  validatorMiddleware,
];

// ✅ Refund Payment Validator
exports.refundPaymentValidator = [
  check('orderId')
    .notEmpty()
    .withMessage('معرف الطلب مطلوب')
    .isMongoId()
    .withMessage('صيغة معرف الطلب غير صالحة'),
  
  check('reason')
    .optional()
    .isString()
    .withMessage('يجب أن يكون السبب نصًا')
    .isLength({ max: 500 })
    .withMessage('يجب أن لا يتجاوز السبب 500 حرف'),
  
  validatorMiddleware,
];

// ✅ Check Payment Status Validator
exports.checkPaymentStatusValidator = [
  check('invoiceId')
    .notEmpty()
    .withMessage('معرف الفاتورة مطلوب')
    .isNumeric()
    .withMessage('يجب أن يكون معرف الفاتورة رقميًا'),
  
  validatorMiddleware,
];