const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { createRatingValidator } = require('../validators/review.validation');
const Auth = require('../controllers/auth.controller');

// إضافة تقييم لمنتج
router.post(
  '/',
  Auth.protect,
  createRatingValidator,
  reviewController.addProductRating
);

// جلب كل التقييمات لمنتج معين
router.get('/:productId', reviewController.getProductRatings);

module.exports = router;
