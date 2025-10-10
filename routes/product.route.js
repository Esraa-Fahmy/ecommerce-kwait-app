const express = require('express');
const {
  getAllProducts,
  getSingleProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImages,
  resizeProductImages
} = require('../controllers/product.controller');

const Auth = require('../controllers/auth.controller');
const {
  getProductValidator,
  createProductValidator,
  deleteProductValidator,
  updateProductValidator,
} = require('../validators/product.validation');

const router = express.Router();

// ============= Routes =============

// ✅ Get All Products / Create Product
router
  .route('/')
  .get(getAllProducts)
  .post(
    Auth.protect,
    Auth.allowedTo('admin'),
    uploadProductImages,
    resizeProductImages,
    createProductValidator,
    createProduct
  );

// ✅ Get Single / Update / Delete Product
router
  .route('/:id')
  .get(getProductValidator, getSingleProduct)
  .put(
    Auth.protect,
    Auth.allowedTo('admin'),
    uploadProductImages,
    resizeProductImages,
    updateProductValidator,
    updateProduct
  )
  .delete(
    Auth.protect,
    Auth.allowedTo('admin'),
    deleteProductValidator,
    deleteProduct
  );

module.exports = router;
