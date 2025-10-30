const express = require("express");
const {
  previewOrder,
  createOrder,
  getUserOrders,
  getAllOrders,
  getOrder,
  updateOrderStatus,
  cancelOrder,
} = require("../controllers/orderCotroller");

const { protect, allowedTo } = require("../controllers/auth.controller");

const router = express.Router();

// =============================
// 🧾 Preview Order (قبل الإنشاء)
// =============================
// ⬅️ المستخدم يراجع السعر قبل ما يعمل الطلب
router.post("/preview",  protect, allowedTo("user"), previewOrder);

// =============================
// ✅ Create Order (إنشاء أوردر جديد)
// =============================
router.post("/",  protect, allowedTo("user"), createOrder);

// =============================
// 📋 Get User Orders (كل أوردرات المستخدم)
// =============================
router.get("/my-orders", protect, allowedTo("user"), getUserOrders);

// =============================
// ❌ Cancel Order (إلغاء أوردر)
// =============================
router.put("/cancel/:id",protect, allowedTo("user"), cancelOrder);

// =============================
// 🧾 Get Single Order (تفاصيل أوردر واحد)
// =============================
router.get("/:id", protect, getOrder);

// =============================
// 🛠 Admin Routes (إدارة الأوردرات)
// =============================
router.get("/", protect, allowedTo("admin"), getAllOrders);
router.put("/:id/status", protect, allowedTo("admin"), updateOrderStatus);

module.exports = router;
