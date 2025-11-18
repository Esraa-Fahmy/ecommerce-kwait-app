const Review = require('../models/reviewModel');
const asyncHandler = require('express-async-handler');
const ApiError = require('../utils/apiError');

// ✅ إضافة تقييم لمنتج
exports.addProductRating = asyncHandler(async (req, res, next) => {
  const { rating, comment, productId } = req.body;

  const newRating = await Review.create({
    rating,
    comment,
    product: productId,
    user: req.user._id,
  });

  const populatedRating = await Review.findById(newRating._id)
    .populate({
      path: 'user',
      select: 'firstName lastName profileImg', // الحاجات اللي عايزاها
    });

  res.status(201).json({
    status: 'success',
    data: populatedRating,
  });
});

// ✅ جلب كل التقييمات لمنتج معين
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

// ✏️ تعديل تقييم (ريڤيو)
exports.updateReview = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { rating, comment } = req.body;

  const review = await Review.findById(id);
  if (!review) return next(new ApiError('Review not found', 404));

  // السماح فقط لصاحب الريڤيو بالتعديل
  if (review.user.toString() !== req.user._id.toString()) {
    return next(new ApiError('You can update only your own review', 403));
  }

  if (rating) review.rating = rating;
  if (comment) review.comment = comment;
  await review.save();

  res.status(200).json({
    status: 'success',
    message: 'Review updated successfully',
    data: review,
  });
});

// 🗑️ حذف تقييم (ريڤيو)
exports.deleteReview = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const review = await Review.findById(id);
  if (!review) return next(new ApiError('Review not found', 404));

  // السماح فقط لصاحب الريڤيو بالحذف
  if (review.user.toString() !== req.user._id.toString()) {
    return next(new ApiError('You can delete only your own review', 403));
  }

  await Review.findByIdAndDelete(id);

  res.status(200).json({
    status: 'success',
    message: 'Review deleted successfully',
  });
});
