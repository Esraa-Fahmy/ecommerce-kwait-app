const { check } = require("express-validator");
const validatorMiddleware = require("../middlewares/validatorMiddleware");

exports.createOrderValidator = [
  check("cartId")
    .notEmpty()
    .withMessage("معرف السلة مطلوب"),

  check("addressId")
    .notEmpty()
    .withMessage("معرف العنوان مطلوب"),

  check("paymentMethod")
    .notEmpty()
    .withMessage("طريقة الدفع مطلوبة")
    .isIn(["cod", "knet"])
    .withMessage("يجب أن تكون طريقة الدفع إما 'cod' أو 'knet'"),

  check("coupon")
    .optional()
    .isString()
    .withMessage("يجب أن يكون الكوبون نصًا"),

  validatorMiddleware,
];