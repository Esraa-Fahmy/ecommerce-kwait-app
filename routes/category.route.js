const express = require('express');

const { getAllCategories, createCategory, getSingleCategory, updateCategory, deleteCategory, uploadCategoryImage, resizeImage } = require('../controllers/category.controller');
const { getCategoryValidator, createCategoryValidation, updateCategoryValidation, deleteCategoryValidation } = require('../validators/category.validation');


const Auth = require('../controllers/auth.controller')

const subCategoriesRoute = require('./subcategory.route')
const router = express.Router();


router.use('/:categoryId/subcategories', subCategoriesRoute)


router.route('/')
.get(getAllCategories)
.post(Auth.protect,
    Auth.allowedTo('admin'),
    uploadCategoryImage,
    resizeImage,
    createCategoryValidation,
    createCategory);
router.route('/:id')
.get(getCategoryValidator, getSingleCategory)
.put(Auth.protect, Auth.allowedTo('admin'), uploadCategoryImage, resizeImage, updateCategoryValidation, updateCategory)
.delete(Auth.protect, Auth.allowedTo('admin'), deleteCategoryValidation, deleteCategory);

module.exports = router;