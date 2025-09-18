const { check } = require("express-validator");
const validatorMiddleware = require("../middlewares/validatorMiddleware");

exports.getSubCategoryValidator = [
  check("id").isMongoId().withMessage("Invalid subCategory id format"),
  validatorMiddleware,
];

exports.createSubCategoryValidation = [
  check("name")
    .notEmpty()
    .withMessage("subCategory Required")
    .isLength({ min: 3 })
    .withMessage("very short subCategory name")
    .isLength({ max: 40 })
    .withMessage(" very long subCategory name"),
  check("category").isMongoId().withMessage("invalid category id format"),
  validatorMiddleware,
];

exports.updateSubCategoryValidation = [
  check("id").isMongoId().withMessage("Invalid subCategory Id"),
  check("name").optional(),
  validatorMiddleware,
];

exports.deleteSubCategoryValidation = [
  check("id").isMongoId().withMessage("Invalid subCategory Id"),
  validatorMiddleware,
];