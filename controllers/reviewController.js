const Review = require('../models/reviewModel');
const Order = require('../models/orderModel');
const asyncHandler = require('express-async-handler');
const ApiError = require('../utils/apiError');

// ✅ إضافة تقييم لمنتج
exports.addProductRating = asyncHandler(async (req, res, next) => {
  const { rating, comment, productId } = req.body;

  // ✅ التحقق من أن المستخدم اشترى المنتج واستلمه
  const deliveredOrder = await Order.findOne({
    user: req.user._id,
    status: 'delivered',
    'cartItems.product': productId
  });

  if (!deliveredOrder) {
    return next(new ApiError('يجب عليك شراء المنتج واستلامه أولاً لتتمكن من تقييمه', 403));
  }

  // ✅ التحقق من عدم وجود تقييم سابق لنفس المنتج من نفس المستخدم
  const existingReview = await Review.findOne({
    user: req.user._id,
    product: productId
  });

  if (existingReview) {
    return next(new ApiError('لقد قمت بتقييم هذا المنتج من قبل. يمكنك تعديل تقييمك السابق.', 400));
  }

  const newRating = await Review.create({
    rating,
    comment,
    product: productId,
    user: req.user._id,
  });

  const populatedRating = await Review.findById(newRating._id)
    .populate({
      path: 'user',
      select: 'firstName lastName profileImg',
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
    .populate('user', 'firstName lastName profileImg');

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


exports.getAllReviews = asyncHandler(async (req, res, next) => {
  const reviews = await Review.find()
    .populate({
      path: 'user',
      select: 'firstName lastName profileImg phone',
    })
    .populate({
      path: 'product',
      select: 'title code _id', // ✅ اسم المنتج، كود المنتج، والـ ID
    })
    .sort('-createdAt'); // ✅ الأحدث أولاً

  res.status(200).json({
    status: 'success',
    results: reviews.length,
    data: reviews,
  });
});