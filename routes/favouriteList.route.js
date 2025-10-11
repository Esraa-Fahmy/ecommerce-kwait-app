const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/favouriteList.controller');
const Auth = require('../controllers/auth.controller');

// ============================
// 🟢 Add product to wishlist
// POST /api/v1/wishlist
// ============================
router.post(
  '/',
  Auth.protect,            // لازم يكون مستخدم مسجل دخول
  wishlistController.addProductToWishlist
);

// ============================
// 🟢 Remove product from wishlist
// DELETE /api/v1/wishlist/:productId
// ============================
router.delete(
  '/:productId',
  Auth.protect,
  wishlistController.removeProductFromWishlist
);

// ============================
// 🟢 Get logged user wishlist
// GET /api/v1/wishlist
// مع إمكانية البحث بالعنوان
// ============================
router.get(
  '/',
  Auth.protect,
  wishlistController.getLoggedUserWishlist
);

module.exports = router;
