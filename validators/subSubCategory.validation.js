const { check } = require("express-validator");
const validatorMiddleware = require("../middlewares/validatorMiddleware");

exports.getSubSubCategoryValidator = [
  check("id").isMongoId().withMessage("صيغة معرف الفئة الفرعية الفرعية غير صالحة"),
  validatorMiddleware,
];

exports.createSubSubCategoryValidation = [
  check("name")
    .notEmpty()
    .withMessage("اسم الفئة الفرعية الفرعية مطلوب")
    .isLength({ min: 3 })
    .withMessage("اسم الفئة الفرعية الفرعية قصير جداً")
    .isLength({ max: 40 })
    .withMessage("اسم الفئة الفرعية الفرعية طويل جداً"),

  check("subCategory")
    .notEmpty()
    .withMessage("معرف الفئة الفرعية مطلوب")
    .isMongoId()
    .withMessage("صيغة معرف الفئة الفرعية غير صالحة"),

  validatorMiddleware,
];

exports.updateSubSubCategoryValidation = [
  check("id").isMongoId().withMessage("صيغة معرف الفئة الفرعية الفرعية غير صالحة"),
  check("name")
    .optional()
    .isLength({ min: 3 })
    .withMessage("اسم الفئة الفرعية الفرعية قصير جداً")
    .isLength({ max: 40 })
    .withMessage("اسم الفئة الفرعية الفرعية طويل جداً"),

  check("subCategory")
    .optional()
    .isMongoId()
    .withMessage("صيغة معرف الفئة الفرعية غير صالحة"),

  validatorMiddleware,
];

exports.deleteSubSubCategoryValidation = [
  check("id").isMongoId().withMessage("صيغة معرف الفئة الفرعية الفرعية غير صالحة"),
  validatorMiddleware,
];
