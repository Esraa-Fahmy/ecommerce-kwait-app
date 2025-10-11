const Review = require('../models/reviewModel');
const asyncHandler = require('express-async-handler');

// إضافة تقييم لمنتج
exports.addProductRating = asyncHandler(async (req, res, next) => {
  const { rating, comment, productId } = req.body;

  const newRating = await Review.create({
    rating,
    comment,
    product: productId,
    user: req.user._id,
  });

  res.status(201).json({
    status: 'success',
    data: newRating,
  });
});

// جلب كل التقييمات لمنتج معين
exports.getProductRatings = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;

  const ratings = await Review.find({ product: productId })
    .populate('user', 'firstName lastName');

  res.status(200).json({
    status: 'success',
    results: ratings.length,
    data: ratings,
  });
});
