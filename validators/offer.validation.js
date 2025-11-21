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
    .isMongoId().withMessage("Invalid product ID format")
    .custom(async (id) => {
      const product = await productModel.findById(id);
      if (!product) throw new Error("Product not found");
      return true;
    }),

  query("subCategoryId")
    .optional()
    .isMongoId().withMessage("Invalid subCategory ID format")
    .custom(async (id) => {
      const subCat = await subCategoryModel.findById(id);
      if (!subCat) throw new Error("SubCategory not found");
      return true;
    }),

  query("subSubCategoryId")
    .optional()
    .isMongoId().withMessage("Invalid subSubCategory ID format")
    .custom(async (id) => {
      const subSub = await subSubCategoryModel.findById(id);
      if (!subSub) throw new Error("SubSubCategory not found");
      return true;
    }),

  query("categoryId")
    .optional()
    .isMongoId().withMessage("Invalid category ID format")
    .custom(async (id) => {
      const cat = await CategoryModel.findById(id);
      if (!cat) throw new Error("Category not found");
      return true;
    }),

  validatorMiddleware
];


// ✅ Get Single Offer
exports.getOfferValidator = [
  check("id")
    .isMongoId()
    .withMessage("Invalid offer id format")
    .custom(async (id) => {
      const offer = await offerModel.findById(id);
      if (!offer) throw new Error("Offer not found");
      return true;
    }),
  validatorMiddleware,
];

// ✅ Create Offer
exports.createOfferValidator = [
  check("title").notEmpty().withMessage("Offer title is required"),
  check("offerType")
    .notEmpty()
    .withMessage("Offer type is required")
    .isIn(['percentage','fixed','buyXgetY','freeShipping','cartDiscount','coupon'])
    .withMessage("Invalid offer type"),
  check("targetType")
    .notEmpty()
    .withMessage("Target type is required")
    .isIn(['product','subcategory','subSubcategory','category','cart', 'order'])
    .withMessage("Invalid target type"),
  check("targetIds").custom(async (targetIds, { req }) => {
    if (['product','category','subcategory','subSubcategory'].includes(req.body.targetType)) {
      if (!targetIds || !Array.isArray(targetIds) || targetIds.length === 0)
        throw new Error("targetIds must be provided as an array");

      for (const id of targetIds) {
        if (!id.match(/^[0-9a-fA-F]{24}$/))
          throw new Error(`Invalid ObjectId format: ${id}`);
        let exists;
        switch (req.body.targetType) {
          case 'product':
            exists = await productModel.findById(id);
            if (!exists) throw new Error(`Product not found for id: ${id}`);
            break;
          case 'category':
            exists = await CategoryModel.findById(id);
            if (!exists) throw new Error(`Category not found for id: ${id}`);
            break;
          case 'subcategory':
            exists = await subSubCategoryModel.findById(id);
            if (!exists) throw new Error(`SubCategory not found for id: ${id}`);
            break;
          case 'subSubcategory':
            exists = await subSubCategoryModel.findById(id);
            if (!exists) throw new Error(`SubSubCategory not found for id: ${id}`);
            break;
        }
      }
    }
    return true;
  }),
  check("discountValue")
  .if((value, { req }) => req.body.offerType === "coupon" || req.body.offerType === "percentage" || req.body.offerType === "fixed")
  .notEmpty()
  .withMessage("Discount value must be provided for this offer type"),
  check("startDate").notEmpty().withMessage("Offer start date is required").isISO8601(),
  check("endDate").notEmpty().withMessage("Offer end date is required").isISO8601(),
  validatorMiddleware,
];

// ✅ Update Offer
exports.updateOfferValidator = [
  check("id")
    .isMongoId()
    .withMessage("Invalid offer id format")
    .custom(async (id) => {
      const offer = await offerModel.findById(id);
      if (!offer) throw new Error("Offer not found");
      return true;
    }),
  validatorMiddleware,
];

// ✅ Delete Offer
exports.deleteOfferValidator = [
  check("id")
    .isMongoId()
    .withMessage("Invalid offer id format")
    .custom(async (id) => {
      const offer = await offerModel.findById(id);
      if (!offer) throw new Error("Offer not found");
      return true;
    }),
  validatorMiddleware,
];
