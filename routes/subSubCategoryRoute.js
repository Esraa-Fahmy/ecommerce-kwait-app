// routes/subSubCategory.route.js
const express = require('express');
const {
  getAllSubSubCategories,
  createSubSubCategory,
  getSingleSubSubCategory,
  updateSubSubCategory,
  deleteSubSubCategory,
  setSubCategoryIdToBody,
  uploadSubSubCategoryImage,
  resizeImage,
} = require('../controllers/subSubCategory.controller');

const Auth = require('../controllers/auth.controller');
const { createSubSubCategoryValidation, updateSubSubCategoryValidation, deleteSubSubCategoryValidation, getSubSubCategoryValidator } = require('../validators/subSubCategory.validation');
const router = express.Router({ mergeParams: true });

router.route('/')
  .get(getAllSubSubCategories)
  .post(
    Auth.protect,
    Auth.allowedTo('admin'),
    uploadSubSubCategoryImage,
    resizeImage,
    setSubCategoryIdToBody,
    createSubSubCategoryValidation,
    createSubSubCategory
  );

router.route('/:id')
  .get( getSubSubCategoryValidator, getSingleSubSubCategory)
  .put(Auth.protect, Auth.allowedTo('admin'), uploadSubSubCategoryImage, resizeImage, updateSubSubCategoryValidation, updateSubSubCategory)
  .delete(Auth.protect, Auth.allowedTo('admin'), deleteSubSubCategoryValidation, deleteSubSubCategory);

module.exports = router;
