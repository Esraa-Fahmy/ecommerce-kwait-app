const asyncHandler = require('express-async-handler');
const User = require('../models/user.model');
const productModel = require('../models/product.model');
const ApiError = require('../utils/apiError');

// @desc    Add story to wishlist
// @route   POST /api/v1/wishlist
// @access  Protected/User
exports.addProductToWishlist = asyncHandler(async (req, res, next) => {
  const { productId } = req.body;

  // ✅ التحقق من أن القصة موجودة في قاعدة البيانات
  const product = await productModel.findById(productId);
  if (!product) {
    return res.status(404).json({
      status: "fail",
      message: "المنتج غير موجود. قد يكون تم حذفه.",
    });
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    return next(new ApiError("المستخدم غير موجود", 404));
  }

  // ❌ منع الـ Admin من إضافة قصص إلى الـ wishlist
  if (user.role === "admin") {
    return res.status(400).json({
      status: "fail",
      message: "لا يمكن للمشرف إضافة منتجات إلى قائمة الرغبات.",
    });
  }

  // ✅ إضافة القصة إذا كانت موجودة
// بعد $addToSet أو $pull
const updatedUser = await User.findByIdAndUpdate(req.user._id, { $addToSet: { wishlist: productId } }, { new: true }).select("wishlist");
res.status(200).json({
  status: "success",
  message: "تم إضافة المنتج بنجاح إلى قائمة الرغبات.",
  wishlistCount: updatedUser.wishlist.length,
  data: updatedUser.wishlist,
});

});



// @route   DELETE /api/v1/wishlist/:productId
// @access  Protected/User
exports.removeProductFromWishlist = asyncHandler(async (req, res, next) => {
  const { productId } = req.params;

  // ✅ التحقق من أن القصة موجودة في قاعدة البيانات
  const product = await productModel.findById(productId);
  if (!product) {
    return res.status(404).json({
      status: "fail",
      message: "المنتج غير موجود. قد يكون تم حذفه.",
    });
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    return next(new ApiError("المستخدم غير موجود", 404));
  }

  // ❌ منع الـ Admin من حذف القصص من الـ wishlist
  if (user.role === "admin") {
    return res.status(400).json({
      status: "fail",
      message: "لا يمكن للمشرف إزالة منتجات من قائمة الرغبات.",
    });
  }

  // ✅ إزالة القصة إذا كانت موجودة
  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $pull: { wishlist: productId } },
    { new: true }
  );

  res.status(200).json({
    status: "success",
    message: "تم إزالة المنتج بنجاح من قائمة الرغبات.",
    data: updatedUser.wishlist,
  });
});


// @desc    Get logged user wishlist with search feature
// @route   GET /api/v1/wishlist
// @access  Protected/User
exports.getLoggedUserWishlist = asyncHandler(async (req, res, next) => {
  const searchQuery = req.query.search
    ? { title: { $regex: req.query.search, $options: "i" } }
    : {};

  const user = await User.findById(req.user._id)
    .populate({
      path: "wishlist",
      match: searchQuery,
    });

  // ✅ إزالة القصص غير الموجودة في قاعدة البيانات
  const validWishlist = user.wishlist.filter(product => product !== null);

  res.status(200).json({
    status: "success",
    results: validWishlist.length,
    data: validWishlist,
  });
});

// 🧹 حذف كل المنتجات من الـ Wishlist
exports.clearWishlist = asyncHandler(async (req, res) => {
  await Wishlist.deleteMany({ user: req.user._id });

  res.status(200).json({
    status: "success",
    message: "تم إزالة جميع عناصر قائمة الرغبات بنجاح.",
  });
});
