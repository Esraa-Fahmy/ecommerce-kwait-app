const { check } = require("express-validator");
const validatorMiddleware = require("../middlewares/validatorMiddleware");

exports.getSubSubCategoryValidator = [
  check("id").isMongoId().withMessage("Invalid SubSubCategory id format"),
  validatorMiddleware,
];

exports.createSubSubCategoryValidation = [
  check("name")
    .notEmpty()
    .withMessage("SubSubCategory name required")
    .isLength({ min: 3 })
    .withMessage("Too short SubSubCategory name")
    .isLength({ max: 40 })
    .withMessage("Too long SubSubCategory name"),

  check("subCategory")
    .notEmpty()
    .withMessage("SubCategory ID required")
    .isMongoId()
    .withMessage("Invalid SubCategory id format"),

  validatorMiddleware,
];

exports.updateSubSubCategoryValidation = [
  check("id").isMongoId().withMessage("Invalid SubSubCategory id format"),
  check("name")
    .optional()
    .isLength({ min: 3 })
    .withMessage("Too short SubSubCategory name")
    .isLength({ max: 40 })
    .withMessage("Too long SubSubCategory name"),

  check("subCategory")
    .optional()
    .isMongoId()
    .withMessage("Invalid SubCategory id format"),

  validatorMiddleware,
];

exports.deleteSubSubCategoryValidation = [
  check("id").isMongoId().withMessage("Invalid SubSubCategory id format"),
  validatorMiddleware,
];
