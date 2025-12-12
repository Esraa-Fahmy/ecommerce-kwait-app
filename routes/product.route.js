const express = require('express');
const {
  getAllProducts,
  getSingleProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getMinimalProducts,
  uploadProductImages,
  resizeProductImages
} = require('../controllers/product.controller');
const { optionalAuth } = require("../middlewares/middlewareOpyional");

const Auth = require('../controllers/auth.controller');
const {
  getProductValidator,
  createProductValidator,
  deleteProductValidator,
  updateProductValidator,
} = require('../validators/product.validation');

const router = express.Router();

// ============= Routes =============

// ✅ Get Minimal Product List
router.get("/min-list", getMinimalProducts);

// ✅ Get All Products / Create Product
router
  .route('/')
  .get(    optionalAuth,
getAllProducts)
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
  .get(    optionalAuth,
getProductValidator, getSingleProduct)
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
