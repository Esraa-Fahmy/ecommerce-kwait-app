const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const OfferModel = require("../models/offer.model");

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
