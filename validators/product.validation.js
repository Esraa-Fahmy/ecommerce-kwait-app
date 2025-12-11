const { check } = require("express-validator");
const validatorMiddleware = require("../middlewares/validatorMiddleware");
const subSubCategoryModel = require("../models/subSubCategory.model");
const subCategoryModel = require("../models/subcategory.model");
const CategoryModel = require("../models/category.model");

exports.getProductValidator = [
  check("id").isMongoId().withMessage("صيغة معرف المنتج غير صالحة"),
  validatorMiddleware,
];

exports.createProductValidator = [
  check("code")
    .notEmpty()
    .withMessage("كود المنتج مطلوب")
    .isLength({ min: 2 })
    .withMessage("يجب أن يكون كود المنتج حرفين على الأقل"),

  check("title")
    .notEmpty()
    .withMessage("عنوان المنتج مطلوب")
    .isLength({ min: 3 })
    .withMessage("عنوان المنتج قصير جداً")
    .isLength({ max: 40 })
    .withMessage("عنوان المنتج طويل جداً"),

  check("description")
    .notEmpty()
    .withMessage("وصف المنتج مطلوب"),

  check("quantity")
    .notEmpty()
    .withMessage("كمية المنتج مطلوبة")
    .isNumeric()
    .withMessage("يجب أن تكون الكمية رقمًا"),

  check("price")
    .notEmpty()
    .withMessage("سعر المنتج مطلوب")
    .isFloat({ gt: 0 })
    .withMessage("يجب أن يكون السعر أكبر من 0"),

  check("priceAfterDiscount")
    .optional()
    .isFloat({ gt: 0 })
    .withMessage("يجب أن يكون السعر بعد الخصم أكبر من 0")
    .custom((value, { req }) => {
      if (value >= req.body.price) {
        throw new Error("يجب أن يكون سعر الخصم أقل من السعر الأصلي");
      }
      return true;
    }),

  // ✅ Category check
  check("category")
    .optional()
    .isMongoId()
    .withMessage("صيغة معرف الفئة غير صالحة")
    .custom(async (categoryId) => {
      const category = await CategoryModel.findById(categoryId);
      if (!category) throw new Error("الفئة غير موجودة");
      return true;
    }),

  // ✅ SubCategory check
  check("subCategory")
    .optional()
    .isMongoId()
    .withMessage("صيغة معرف الفئة الفرعية غير صالحة")
    .custom(async (subCategoryId) => {
      const subCat = await subCategoryModel.findById(subCategoryId);
      if (!subCat) throw new Error("الفئة الفرعية غير موجودة");
      return true;
    }),

  // ✅ SubSubCategory check
  check("subSubCategory")
    .optional()
    .isMongoId()
    .withMessage("صيغة معرف الفئة الفرعية الفرعية غير صالحة")
    .custom(async (subSubCategoryId) => {
      const subSub = await subSubCategoryModel.findById(subSubCategoryId);
      if (!subSub) throw new Error("الفئة الفرعية الفرعية غير موجودة");
      return true;
    }),

  check("colors")
    .optional()
    .isArray()
    .withMessage("يجب أن تكون الألوان مصفوفة من النصوص"),

  check("sizes")
    .optional()
    .isArray()
    .withMessage("يجب أن تكون الأحجام مصفوفة من النصوص"),

  validatorMiddleware,
];

exports.updateProductValidator = [
  check("id").isMongoId().withMessage("صيغة معرف المنتج غير صالحة"),
  check("title").optional().isLength({ min: 3, max: 40 }),
  check("price").optional().isFloat({ gt: 0 }),
  check("quantity").optional().isNumeric(),
  check("priceAfterDiscount")
    .optional()
    .isFloat({ gt: 0 })
    .custom((value, { req }) => {
      if (value >= req.body.price) {
        throw new Error("يجب أن يكون سعر الخصم أقل من السعر الأصلي");
      }
      return true;
    }),
  validatorMiddleware,
];

exports.deleteProductValidator = [
  check("id").isMongoId().withMessage("صيغة معرف المنتج غير صالحة"),
  validatorMiddleware,
];
