const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const OfferModel = require("../models/offer.model");
const { sendNotification } = require("../utils/sendNotifications");
const User = require("../models/user.model");
const Cart = require("../models/cartModel");

// ============================
// ✅ Get All Offers
// ============================
exports.getAllOffers = asyncHandler(async (req, res) => {
  const filter = { isActive: true }; // افتراضياً نرجع العروض المفعلة فقط

  // لو فيه فلترة حسب target
  if (req.query.productId || req.query.subCategoryId || req.query.subSubCategoryId || req.query.categoryId) {
    filter.$or = [];

    if (req.query.productId) {
      filter.$or.push({ targetType: 'product', targetIds: req.query.productId });
    }

    if (req.query.subCategoryId) {
      filter.$or.push({ targetType: 'subcategory', targetIds: req.query.subCategoryId });
    }

    if (req.query.subSubCategoryId) {
      filter.$or.push({ targetType: 'subSubcategory', targetIds: req.query.subSubCategoryId });
    }

    if (req.query.categoryId) {
      filter.$or.push({ targetType: 'category', targetIds: req.query.categoryId });
    }

    // لو ما اتضافش حاجة في $or، نحذفها عشان مانعملش فلتر فاضي
    if (filter.$or.length === 0) delete filter.$or;
  }

  const offers = await OfferModel.find(filter)
    .sort({ priority: -1, createdAt: -1 });

  res.status(200).json({
    results: offers.length,
    data: offers
  });
});

// ============================
// ✅ Get Single Offer
// ============================
exports.getOffer = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const offer = await OfferModel.findById(id);
  if (!offer) return next(new ApiError(`No offer found for this id ${id}`, 404));
  res.status(200).json({ data: offer });
});

// ============================
// ✅ Create Offer
// ============================
exports.createOffer = asyncHandler(async (req, res) => {
  const offer = await OfferModel.create(req.body);

const users = await User.find({});
await Promise.all(users.map(user => 
  sendNotification(
    user._id,
    "عرض جديد متاح!",
    `تم إضافة عرض جديد على ${offer.targetType}، احصل عليه الآن!`,
    "offer"
  )
));

  res.status(201).json({ data: offer });
});

// ============================
// ✅ Update Offer
// ============================
exports.updateOffer = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const offer = await OfferModel.findByIdAndUpdate(id, req.body, { new: true });
  if (!offer) return next(new ApiError(`No offer found for this id ${id}`, 404));
  res.status(200).json({ data: offer });
});

// ============================
// ✅ Delete Offer
// ============================
exports.deleteOffer = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const offer = await OfferModel.findByIdAndDelete(id);
  if (!offer) return next(new ApiError(`No offer found for this id ${id}`, 404));
  res.status(200).json({ message: "Offer deleted successfully" });
});

// ============================
// ✅ Validate Coupon
// ============================
exports.validateCoupon = asyncHandler(async (req, res, next) => {
  const { couponCode, cartId } = req.body;

  if (!couponCode) {
    return next(new ApiError("Coupon code is required", 400));
  }

  const coupon = await OfferModel.findOne({ couponCode, offerType: "coupon", isActive: true });
  if (!coupon) {
    return res.status(400).json({
      status: "error",
      message: "❌ هذا الكود غير صالح أو غير موجود."
    });
  }

  const now = new Date();
  if (coupon.startDate > now) {
    return res.status(400).json({
      status: "error",
      message: "⚠️ هذا الكود لم يبدأ بعد."
    });
  }
  if (coupon.endDate < now) {
    return res.status(400).json({
      status: "error",
      message: "⚠️ انتهت صلاحية هذا الكود."
    });
  }

  // ✅ حساب الخصم على السلة
  let totalDiscount = 0;
  let totalPrice = 0;
  
  if (cartId) {
    const cart = await Cart.findById(cartId).populate("cartItems.product");
    if (!cart) return next(new ApiError("Cart not found", 404));

    // ✅ استخدام priceAfterOffer بدلاً من السعر الأصلي
    for (const item of cart.cartItems) {
      const itemPrice = item.priceAfterOffer || item.price || 0;
      totalPrice += itemPrice * item.quantity;
    }

    if (coupon.discountValue) {
      // ✅ دعم النسب العشرية: لو القيمة أقل من 1، اضربها في 100
      const discountPercentage = coupon.discountValue < 1 
        ? coupon.discountValue * 100 
        : coupon.discountValue;
      
      totalDiscount = totalPrice * (discountPercentage / 100);
    }
  }

  // ✅ حساب النسبة المئوية الصحيحة للعرض
  const displayPercentage = coupon.discountValue < 1 
    ? coupon.discountValue * 100 
    : coupon.discountValue;

  res.status(200).json({
    status: "success",
    message: `✅ الكوبون صالح! خصم ${displayPercentage}%`,
    data: {
      couponCode: coupon.couponCode,
      discountPercentage: displayPercentage,
      discountAmount: totalDiscount,
      totalBeforeDiscount: totalPrice,
      totalAfterDiscount: totalPrice - totalDiscount
    }
  });
});
