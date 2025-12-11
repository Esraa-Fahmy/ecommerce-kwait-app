const { check } = require("express-validator");
const validatorMiddleware = require("../middlewares/validatorMiddleware");

exports.addToCartValidator = [
  check("productId")
    .notEmpty().withMessage("معرف المنتج مطلوب")
    .isMongoId().withMessage("صيغة معرف المنتج غير صالحة"),

  check("quantity")
    .optional()
    .isInt({ min: 1 })
    .withMessage("يجب أن تكون الكمية 1 على الأقل"),

  check("color")
    .optional()
    .isString()
    .withMessage("يجب أن يكون اللون نصًا صالحًا"),

  check("size")
    .optional()
    .isString()
    .withMessage("يجب أن يكون الحجم نصًا صالحًا"),

  validatorMiddleware,
];


// ✅ تعديل كمية منتج داخل الكارت
exports.updateCartItemValidator = [
  check("itemId")
    .isMongoId()
    .withMessage("صيغة معرف العنصر غير صالحة"),

  check("quantity")
    .optional()
    .isInt({ min: 1 })
    .withMessage("يجب أن تكون الكمية 1 على الأقل"),

  check("color")
    .optional()
    .isString()
    .withMessage("يجب أن يكون اللون نصًا صالحًا"),

  check("size")
    .optional()
    .isString()
    .withMessage("يجب أن يكون الحجم نصًا صالحًا"),

  check("material")
    .optional()
    .isString()
    .withMessage("يجب أن تكون المادة نصًا صالحًا"),

  validatorMiddleware,
];


// ✅ حذف منتج من الكارت
exports.removeCartItemValidator = [
  check("itemId")
    .isMongoId()
    .withMessage("صيغة معرف العنصر غير صالحة"),

  validatorMiddleware,
];
