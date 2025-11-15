const { check } = require("express-validator");
const validatorMiddleware = require("../middlewares/validatorMiddleware");

exports.createOrderValidator = [
  check("cartId")
    .notEmpty()
    .withMessage("Cart ID is required"),

  check("addressId")
    .notEmpty()
    .withMessage("Address ID is required"),

  check("paymentMethod")
    .notEmpty()
    .withMessage("Payment method is required")
    .isIn(["cod", "visa"])
    .withMessage("Payment method must be either 'cod' or 'visa'"),

  check("coupon")
    .optional()
    .isString()
    .withMessage("Coupon must be a string"),

  validatorMiddleware,
];
