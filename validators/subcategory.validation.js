const { check } = require("express-validator");
const validatorMiddleware = require("../middlewares/validatorMiddleware");
const Category = require("../models/category.model");

exports.getSubCategoryValidator = [
  check("id").isMongoId().withMessage("صيغة معرف الفئة الفرعية غير صالحة"),
  validatorMiddleware,
];

exports.createSubCategoryValidation = [
  check("name")
    .notEmpty()
    .withMessage("الفئة الفرعية مطلوبة")
    .isLength({ min: 3 })
    .withMessage("اسم الفئة الفرعية قصير جداً")
    .isLength({ max: 40 })
    .withMessage("اسم الفئة الفرعية طويل جداً"),
  check("category")
    .isMongoId()
    .withMessage("صيغة معرف الفئة غير صالحة")
    .custom(async (categoryId) => {
      const category = await Category.findById(categoryId);
      if (!category) {
        throw new Error(`لم يتم العثور على فئة بالمعرف: ${categoryId}. يرجى إنشاء فئة أولاً.`);
      }
      return true;
    }),
  validatorMiddleware,
];

exports.updateSubCategoryValidation = [
  check("id").isMongoId().withMessage("معرف الفئة الفرعية غير صالح"),
  check("name").optional(),
  validatorMiddleware,
];

exports.deleteSubCategoryValidation = [
  check("id").isMongoId().withMessage("معرف الفئة الفرعية غير صالح"),
  validatorMiddleware,
];