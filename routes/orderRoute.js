// routes/order.route.js
const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderCotroller");
const auth = require("../controllers/auth.controller");

// جميع الراوتس محمية
router.use(auth.protect);

// user endpoints
router.post("/", auth.allowedTo("user"), orderController.createOrder);             // create order from cart
router.get("/", auth.allowedTo("user"), orderController.getMyOrders);              // get my orders (with optional ?status=&q=)
router.get("/:id",  orderController.getOrderById);          // get single order
router.put("/:id/cancel", auth.allowedTo("user"),  orderController.cancelOrderByUser); // user cancel (only pending)

// admin endpoints
router.get("/all", auth.allowedTo("admin"), orderController.adminGetAllOrders);
router.put("/:id/status", auth.allowedTo("admin"), orderController.adminUpdateOrderStatus);
router.put("/bulk-status", auth.allowedTo("admin"), orderController.bulkUpdateOrderStatus);


module.exports = router;
