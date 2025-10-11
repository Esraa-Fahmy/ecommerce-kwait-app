const { check } = require("express-validator");
const validatorMiddleware = require("../middlewares/validatorMiddleware");

exports.getProductValidator = [
  check("id").isMongoId().withMessage("Invalid product id format"),
  validatorMiddleware,
];

exports.createProductValidator = [
  check("code")
    .notEmpty()
    .withMessage("Product code is required")
    .isLength({ min: 2 })
    .withMessage("Product code must be at least 2 characters"),

  check("title")
    .notEmpty()
    .withMessage("Product title is required")
    .isLength({ min: 3 })
    .withMessage("Too short product title")
    .isLength({ max: 40 })
    .withMessage("Too long product title"),

  check("description")
    .notEmpty()
    .withMessage("Product description is required"),

  check("quantity")
    .notEmpty()
    .withMessage("Product quantity is required")
    .isNumeric()
    .withMessage("Quantity must be a number"),

  check("price")
    .notEmpty()
    .withMessage("Product price is required")
    .isFloat({ gt: 0 })
    .withMessage("Price must be greater than 0"),

  check("priceAfterDiscount")
    .optional()
    .isFloat({ gt: 0 })
    .withMessage("Price after discount must be greater than 0")
    .custom((value, { req }) => {
      if (value >= req.body.price) {
        throw new Error("Discount price should be lower than original price");
      }
      return true;
    }),

  check("category")
    .optional()
    .isMongoId()
    .withMessage("Invalid category ID format"),



  check("subCategory.*")
    .optional()
    .isMongoId()
    .withMessage("Invalid subCategory ID format"),



  check("subSubCategory.*")
    .optional()
    .isMongoId()
    .withMessage("Invalid subSubCategory ID format"),

  check("colors")
    .optional()
    .isArray()
    .withMessage("Colors should be an array of strings"),

  check("sizes")
    .optional()
    .isArray()
    .withMessage("Sizes should be an array of strings"),

  check("ratingsAverage")
    .optional()
    .isFloat({ min: 1, max: 5 })
    .withMessage("Ratings average must be between 1 and 5"),

  check("ratingsQuantity")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Ratings quantity must be a positive integer"),

  validatorMiddleware,
];

exports.updateProductValidator = [
  check("id").isMongoId().withMessage("Invalid product ID format"),
  check("title").optional().isLength({ min: 3, max: 40 }),
  check("price").optional().isFloat({ gt: 0 }),
  check("quantity").optional().isNumeric(),
  check("priceAfterDiscount")
    .optional()
    .isFloat({ gt: 0 })
    .custom((value, { req }) => {
      if (value >= req.body.price) {
        throw new Error("Discount price should be lower than original price");
      }
      return true;
    }),
  validatorMiddleware,
];

exports.deleteProductValidator = [
  check("id").isMongoId().withMessage("Invalid product ID format"),
  validatorMiddleware,
];
