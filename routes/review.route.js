const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { createRatingValidator } = require('../validators/review.validation');
const Auth = require('../controllers/auth.controller');

// ➕ إضافة تقييم لمنتج
router.post('/', Auth.protect, Auth.allowedTo("user"), createRatingValidator, reviewController.addProductRating);

// 📄 جلب كل التقييمات لمنتج معين
router.get('/:productId', Auth.protect, reviewController.getProductRatings);

// ✏️ تعديل تقييم
router.put('/:id', Auth.protect, Auth.allowedTo("user"), reviewController.updateReview);

// 🗑️ حذف تقييم
router.delete('/:id', Auth.protect, reviewController.deleteReview);

module.exports = router;
