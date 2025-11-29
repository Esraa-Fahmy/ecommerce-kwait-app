// routes/shipping.routes.js
const express = require("express");
const router = express.Router();
const {
  addCity,
  getAllCities,
  updateCity,
  deleteCity,
  getAvailableShippingTypes,
  addShippingType,
  updateShippingType,
  deleteShippingType,
} = require("../controllers/shippingController");
const { protect, allowedTo } = require("../controllers/auth.controller");

router.use(protect); // لازم يكون مسجل دخول

// User endpoint - get available shipping types for a city
router.get("/available", getAvailableShippingTypes);

// Admin endpoints - Cities
router.get("/", getAllCities);
router.post("/", allowedTo("admin"), addCity);
router.put("/:id", allowedTo("admin"), updateCity);
router.delete("/:id", allowedTo("admin"), deleteCity);

// Admin endpoints - Shipping Types Management
router.post("/:cityId/types", allowedTo("admin"), addShippingType);
router.put("/:cityId/types/:typeId", allowedTo("admin"), updateShippingType);
router.delete("/:cityId/types/:typeId", allowedTo("admin"), deleteShippingType);

module.exports = router;
