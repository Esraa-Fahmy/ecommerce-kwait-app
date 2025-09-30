const express = require('express');
const { getAllsubCategories, createsubCategory, getSingleSubCategory, updatesubCategory, deletesubCategory, setCategoryIdToBody, uploadsubCategoryImage, resizeImage } = require('../controllers/subcategory.controller');
const { createSubCategoryValidation, getSubCategoryValidator, updateSubCategoryValidation, deleteSubCategoryValidation } = require('../validators/subcategory.validation');

const Auth = require('../controllers/auth.controller')


const router = express.Router({mergeParams: true});

//const productRoutes = require("./product.route");
const subSubCategory = require("./subSubCategoryRoute");


//router.use("/:subCategoryId/products", productRoutes );
router.use("/:subCategoryId/subSubCategories", subSubCategory );



router.route('/')
// subCategoryRoute.js
router.route('/')
  .get(getAllsubCategories)
  .post(
    Auth.protect,
    Auth.allowedTo('admin'),
       uploadsubCategoryImage,
        resizeImage,
    setCategoryIdToBody,
    createSubCategoryValidation,
    createsubCategory
  );

router.route('/:id')
.get(getSubCategoryValidator, getSingleSubCategory)
.put(Auth.protect,  Auth.allowedTo('admin'), uploadsubCategoryImage, resizeImage, updateSubCategoryValidation, updatesubCategory)
.delete(Auth.protect, Auth.allowedTo('admin'), deleteSubCategoryValidation, deletesubCategory);

module.exports = router;