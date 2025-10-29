// controllers/shipping.controller.js
const asyncHandler = require("express-async-handler");
const Shipping = require("../models/shippingModel");
const ApiError = require("../utils/apiError");

// @desc Add new shipping city (admin only)
exports.addCity = asyncHandler(async (req, res, next) => {
  const { city, cost } = req.body;

  const existing = await Shipping.findOne({ city });
  if (existing) return next(new ApiError("City already exists", 400));

  const newCity = await Shipping.create({ city, cost });
  res.status(201).json({ status: "success", data: newCity });
});

// @desc Get all cities
exports.getAllCities = asyncHandler(async (req, res) => {
  const cities = await Shipping.find().sort("city");
  res.status(200).json({ results: cities.length, data: cities });
});

// @desc Update shipping cost
exports.updateCity = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { cost } = req.body;

  const city = await Shipping.findByIdAndUpdate(id, { cost }, { new: true });
  if (!city) return next(new ApiError("City not found", 404));

  res.status(200).json({ status: "success", data: city });
});

// @desc Delete city
exports.deleteCity = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const city = await Shipping.findByIdAndDelete(id);
  if (!city) return next(new ApiError("City not found", 404));

  res.status(200).json({ status: "success", message: "City removed" });
});
