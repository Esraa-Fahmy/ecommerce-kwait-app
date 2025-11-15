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
