// controllers/shipping.controller.js
const asyncHandler = require("express-async-handler");
const Shipping = require("../models/shippingModel");
const ApiError = require("../utils/apiError");

// @desc Add new shipping city (admin only)
exports.addCity = asyncHandler(async (req, res, next) => {
  const { city, cost, shippingTypes } = req.body;

  const existing = await Shipping.findOne({ city });
  if (existing) return next(new ApiError("المدينة موجودة بالفعل", 400));

  // ✅ Support both old format (cost) and new format (shippingTypes)
  const cityData = { city };
  
  if (shippingTypes && Array.isArray(shippingTypes)) {
    // New format with multiple shipping types
    cityData.shippingTypes = shippingTypes;
  } else if (cost) {
    // Old format - will be converted to standard type by pre-save hook
    cityData.cost = cost;
  }

  const newCity = await Shipping.create(cityData);
  res.status(201).json({ status: "success", data: newCity });
});

// @desc Get all cities
exports.getAllCities = asyncHandler(async (req, res) => {
  const cities = await Shipping.find().sort("city");
  res.status(200).json({ results: cities.length, data: cities });
});

// @desc Update shipping cost or types
exports.updateCity = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { city: cityName, cost, shippingTypes } = req.body;

  const city = await Shipping.findById(id);
  if (!city) return next(new ApiError("المدينة غير موجودة", 404));

  // ✅ Update city name if provided
  if (cityName !== undefined) {
    // Check if new city name already exists (except for current city)
    const existingCity = await Shipping.findOne({ 
      city: cityName, 
      _id: { $ne: id } 
    });
    if (existingCity) {
      return next(new ApiError("اسم المدينة موجود بالفعل", 400));
    }
    city.city = cityName;
  }

  // ✅ Support both old format (cost) and new format (shippingTypes)
  if (shippingTypes && Array.isArray(shippingTypes)) {
    // Update with new shipping types
    city.shippingTypes = shippingTypes;
  } else if (cost !== undefined) {
    // Update old cost field
    city.cost = cost;
    // Also update standard type if it exists
    const standardType = city.shippingTypes.find(t => t.type === 'standard');
    if (standardType) {
      standardType.cost = cost;
    }
  }

  await city.save();
  res.status(200).json({ status: "success", data: city });
});

// @desc Delete city
exports.deleteCity = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const city = await Shipping.findByIdAndDelete(id);
  if (!city) return next(new ApiError("المدينة غير موجودة", 404));

  res.status(200).json({ status: "success", message: "تم حذف المدينة" });
});

// =============================
// 📦 SHIPPING TYPE MANAGEMENT
// =============================

// @desc Add shipping type to city
exports.addShippingType = asyncHandler(async (req, res, next) => {
  const { cityId } = req.params;
  const { type, name, cost, deliveryTime, deliveryHours, cutoffTime, isActive } = req.body;

  const city = await Shipping.findById(cityId);
  if (!city) return next(new ApiError("المدينة غير موجودة", 404));

  // Check if type already exists
  const existingType = city.shippingTypes.find(t => t.type === type);
  if (existingType) {
    return next(new ApiError(`نوع الشحن '${type}' موجود بالفعل لهذه المدينة`, 400));
  }

  // Add new shipping type
  city.shippingTypes.push({
    type,
    name,
    cost,
    deliveryTime,
    deliveryHours,
    cutoffTime: cutoffTime || null,
    isActive: isActive !== undefined ? isActive : true
  });

  await city.save();
  res.status(201).json({ 
    status: "success", 
    message: "تم إضافة نوع الشحن بنجاح",
    data: city 
  });
});

// @desc Update specific shipping type
exports.updateShippingType = asyncHandler(async (req, res, next) => {
  const { cityId, typeId } = req.params;
  const updates = req.body;

  const city = await Shipping.findById(cityId);
  if (!city) return next(new ApiError("المدينة غير موجودة", 404));

  // Find the shipping type by _id
  const shippingType = city.shippingTypes.id(typeId);
  if (!shippingType) {
    return next(new ApiError("نوع الشحن غير موجود", 404));
  }

  // Update only provided fields
  if (updates.name !== undefined) shippingType.name = updates.name;
  if (updates.cost !== undefined) shippingType.cost = updates.cost;
  if (updates.deliveryTime !== undefined) shippingType.deliveryTime = updates.deliveryTime;
  if (updates.deliveryHours !== undefined) shippingType.deliveryHours = updates.deliveryHours;
  if (updates.cutoffTime !== undefined) shippingType.cutoffTime = updates.cutoffTime;
  if (updates.isActive !== undefined) shippingType.isActive = updates.isActive;

  await city.save();
  res.status(200).json({ 
    status: "success", 
    message: "تم تحديث نوع الشحن بنجاح",
    data: city 
  });
});

// @desc Delete specific shipping type
exports.deleteShippingType = asyncHandler(async (req, res, next) => {
  const { cityId, typeId } = req.params;

  const city = await Shipping.findById(cityId);
  if (!city) return next(new ApiError("المدينة غير موجودة", 404));

  // Find and remove the shipping type
  const shippingType = city.shippingTypes.id(typeId);
  if (!shippingType) {
    return next(new ApiError("نوع الشحن غير موجود", 404));
  }

  city.shippingTypes.pull(typeId);
  await city.save();

  res.status(200).json({ 
    status: "success", 
    message: "تم حذف نوع الشحن بنجاح",
    data: city 
  });
});


// @desc Get available shipping types for a city (for users)
exports.getAvailableShippingTypes = asyncHandler(async (req, res, next) => {
  const { city } = req.query;
  
  if (!city) {
    return next(new ApiError("معرف المدينة مطلوب", 400));
  }

  const shipping = await Shipping.findOne({ city });
  if (!shipping) {
    return next(new ApiError("لا يوجد شحن متاح لهذه المدينة", 404));
  }

  // Check current time for same-day availability
  const now = new Date();
  const cutoffHour = 12;
  const isSameDayAvailable = now.getHours() < cutoffHour;

  let availableTypes = [];

  if (shipping.shippingTypes && shipping.shippingTypes.length > 0) {
    // New format with multiple types
    availableTypes = shipping.shippingTypes
      .filter(type => type.isActive)
      .map(type => {
        // Check availability based on cutoff time
        let isAvailable = true;
        let reason = null;

        if (type.cutoffTime) {
          const [cutoffHour, cutoffMinute] = type.cutoffTime.split(':').map(Number);
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          const cutoffMinutes = cutoffHour * 60 + (cutoffMinute || 0);

          if (currentMinutes >= cutoffMinutes) {
            isAvailable = false;
            reason = `غير متاح بعد الساعة ${type.cutoffTime}`;
          }
        }

        return {
          _id: type._id,
          id: type.type,
          type: type.type,
          name: type.name,
          cost: type.cost,
          deliveryTime: type.deliveryTime,
          cutoffTime: type.cutoffTime || null,
          isAvailable,
          reason
        };
      });
  } else if (shipping.cost) {
    // Backward compatibility - old format
    availableTypes = [{
      id: 'standard',
      type: 'standard',
      name: 'شحن عادي',
      cost: shipping.cost,
      deliveryTime: '2-3 أيام',
      isAvailable: true,
      reason: null
    }];
  }

  res.status(200).json({
    status: "success",
    results: availableTypes.length,
    data: availableTypes
  });
});
