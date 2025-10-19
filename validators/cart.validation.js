const { check } = require("express-validator");
const validatorMiddleware = require("../middlewares/validatorMiddleware");

exports.addToCartValidator = [
  check("productId")
    .notEmpty().withMessage("Product ID is required")
    .isMongoId().withMessage("Invalid product ID format"),

  check("quantity")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Quantity must be at least 1"),

  check("color")
    .optional()
    .isString()
    .withMessage("Color must be a valid string"),

  check("size")
    .optional()
    .isString()
    .withMessage("Size must be a valid string"),

  validatorMiddleware,
];


// ✅ تعديل كمية منتج داخل الكارت
exports.updateCartItemQuantityValidator = [
  check("itemId")
    .isMongoId()
    .withMessage("Invalid item ID format"),

  check("quantity")
    .notEmpty()
    .withMessage("Quantity is required")
    .isInt({ min: 1 })
    .withMessage("Quantity must be at least 1"),

  validatorMiddleware,
];

// ✅ حذف منتج من الكارت
exports.removeCartItemValidator = [
  check("itemId")
    .isMongoId()
    .withMessage("Invalid item ID format"),

  validatorMiddleware,
];
