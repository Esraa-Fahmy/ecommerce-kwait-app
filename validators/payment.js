const { check } = require("express-validator");
const validatorMiddleware = require("../middlewares/validatorMiddleware");

exports.initiatePaymentValidator = [
  check("orderId")
    .notEmpty()
    .withMessage("Order ID is required"),

  check("paymentMethodId")
    .notEmpty()
    .withMessage("Payment method ID is required")
    .isNumeric()
    .withMessage("Payment method ID must be a number"),

  validatorMiddleware,
];

exports.refundPaymentValidator = [
  check("orderId")
    .notEmpty()
    .withMessage("Order ID is required")
    .isMongoId()
    .withMessage("Invalid Order ID format"),

  check("reason")
    .optional()
    .isString()
    .withMessage("Reason must be a string")
    .isLength({ min: 3, max: 500 })
    .withMessage("Reason must be between 3 and 500 characters"),

  validatorMiddleware,
];
