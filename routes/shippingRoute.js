// routes/shipping.routes.js
const express = require("express");
const router = express.Router();
const {
  addCity,
  getAllCities,
  updateCity,
  deleteCity,
} = require("../controllers/shippingController");
const { protect, allowedTo } = require("../controllers/auth.controller");

router.use(protect); // لازم يكون مسجل دخول
router.get("/", getAllCities);
router.post("/", allowedTo("admin"), addCity);
router.put("/:id", allowedTo("admin"), updateCity);
router.delete("/:id", allowedTo("admin"), deleteCity);

module.exports = router;
