const asyncHandler = require("express-async-handler");
const Address = require("../models/addressModel");
const ApiError = require("../utils/apiError");

// ✅ إضافة عنوان جديد
exports.addAddress = asyncHandler(async (req, res) => {
  const address = await Address.create({
    ...req.body,
    user: req.user._id,
  });

  res.status(201).json({
    status: "success",
    message: "Address added successfully",
    data: address,
  });
});

// 🟡 جلب كل العناوين الخاصة بالمستخدم
exports.getUserAddresses = asyncHandler(async (req, res) => {
  const addresses = await Address.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.status(200).json({
    status: "success",
    results: addresses.length,
    data: addresses,
  });
});

// 🔵 تعديل عنوان
exports.updateAddress = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const address = await Address.findOneAndUpdate(
    { _id: id, user: req.user._id },
    req.body,
    { new: true }
  );
  if (!address) return next(new ApiError("Address not found", 404));

  res.status(200).json({
    status: "success",
    message: "Address updated successfully",
    data: address,
  });
});

// 🔴 حذف عنوان
exports.deleteAddress = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const address = await Address.findOneAndDelete({ _id: id, user: req.user._id });
  if (!address) return next(new ApiError("Address not found", 404));

  res.status(200).json({
    status: "success",
    message: "Address deleted successfully",
  });
});
