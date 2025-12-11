const { check } = require("express-validator");
const validatorMiddleware = require("../middlewares/validatorMiddleware");
const CategoryModel = require("../models/category.model");
const subCategoryModel = require("../models/subcategory.model");
const productModel = require("../models/product.model");
const subSubCategoryModel = require("../models/subSubCategory.model");
const offerModel = require("../models/offer.model");
const { query } = require('express-validator');





// ====== Get All Offers Validator ======
exports.getAllOffersValidator = [
  query("productId")
    .optional()
    .isMongoId().withMessage("صيغة معرف المنتج غير صالحة")
    .custom(async (id) => {
      const product = await productModel.findById(id);
      if (!product) throw new Error("المنتج غير موجود");
      return true;
    }),

  query("subCategoryId")
    .optional()
    .isMongoId().withMessage("صيغة معرف الفئة الفرعية غير صالحة")
    .custom(async (id) => {
      const subCat = await subCategoryModel.findById(id);
      if (!subCat) throw new Error("الفئة الفرعية غير موجودة");
      return true;
    }),

  query("subSubCategoryId")
    .optional()
    .isMongoId().withMessage("صيغة معرف الفئة الفرعية الفرعية غير صالحة")
    .custom(async (id) => {
      const subSub = await subSubCategoryModel.findById(id);
      if (!subSub) throw new Error("الفئة الفرعية الفرعية غير موجودة");
      return true;
    }),

  query("categoryId")
    .optional()
    .isMongoId().withMessage("صيغة معرف الفئة غير صالحة")
    .custom(async (id) => {
      const cat = await CategoryModel.findById(id);
      if (!cat) throw new Error("الفئة غير موجودة");
      return true;
    }),

  validatorMiddleware
];


// ✅ Get Single Offer
exports.getOfferValidator = [
  check("id")
    .isMongoId()
    .withMessage("صيغة معرف العرض غير صالحة")
    .custom(async (id) => {
      const offer = await offerModel.findById(id);
      if (!offer) throw new Error("العرض غير موجود");
      return true;
    }),
  validatorMiddleware,
];

// ✅ Create Offer
exports.createOfferValidator = [
  check("title").notEmpty().withMessage("عنوان العرض مطلوب"),
  check("offerType")
    .notEmpty()
    .withMessage("نوع العرض مطلوب")
    .isIn(['percentage','fixed','buyXgetY','freeShipping','cartDiscount','coupon'])
    .withMessage("نوع العرض غير صالح"),
  check("targetType")
    .notEmpty()
    .withMessage("نوع الهدف مطلوب")
    .isIn(['product','subcategory','subSubcategory','category','cart', 'order'])
    .withMessage("نوع الهدف غير صالح"),
  check("targetIds").custom(async (targetIds, { req }) => {
    if (['product','category','subcategory','subSubcategory'].includes(req.body.targetType)) {
      if (!targetIds || !Array.isArray(targetIds) || targetIds.length === 0)
        throw new Error("يجب تقديم معرفات الهدف كمصفوفة");

      for (const id of targetIds) {
        if (!id.match(/^[0-9a-fA-F]{24}$/))
          throw new Error(`صيغة معرف الكائن غير صالحة: ${id}`);
        let exists;
        switch (req.body.targetType) {
          case 'product':
            exists = await productModel.findById(id);
            if (!exists) throw new Error(`المنتج غير موجود للمعرف: ${id}`);
            break;
          case 'category':
            exists = await CategoryModel.findById(id);
            if (!exists) throw new Error(`الفئة غير موجودة للمعرف: ${id}`);
            break;
          case 'subcategory':
            exists = await subSubCategoryModel.findById(id);
            if (!exists) throw new Error(`الفئة الفرعية غير موجودة للمعرف: ${id}`);
            break;
          case 'subSubcategory':
            exists = await subSubCategoryModel.findById(id);
            if (!exists) throw new Error(`الفئة الفرعية الفرعية غير موجودة للمعرف: ${id}`);
            break;
        }
      }
    }
    return true;
  }),
  check("discountValue")
  .if((value, { req }) => req.body.offerType === "coupon" || req.body.offerType === "percentage" || req.body.offerType === "fixed")
  .notEmpty()
  .withMessage("يجب تقديم قيمة الخصم لنوع العرض هذا"),
  check("startDate").notEmpty().withMessage("تاريخ بدء العرض مطلوب").isISO8601(),
  check("endDate").notEmpty().withMessage("تاريخ انتهاء العرض مطلوب").isISO8601(),
  validatorMiddleware,
];

// ✅ Update Offer
exports.updateOfferValidator = [
  check("id")
    .isMongoId()
    .withMessage("صيغة معرف العرض غير صالحة")
    .custom(async (id) => {
      const offer = await offerModel.findById(id);
      if (!offer) throw new Error("العرض غير موجود");
      return true;
    }),
  validatorMiddleware,
];

// ✅ Delete Offer
exports.deleteOfferValidator = [
  check("id")
    .isMongoId()
    .withMessage("صيغة معرف العرض غير صالحة")
    .custom(async (id) => {
      const offer = await offerModel.findById(id);
      if (!offer) throw new Error("العرض غير موجود");
      return true;
    }),
  validatorMiddleware,
];
