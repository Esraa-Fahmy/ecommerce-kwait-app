const express = require("express");
const {
  addToCart,
  getLoggedUserCart,
  updateCartItemQuantity,
  removeItemFromCart,
  clearCart,
} = require("../controllers/cartController");

const {
  addToCartValidator,
  updateCartItemQuantityValidator,
  removeCartItemValidator,
} = require("../validators/cart.validation");

const authService = require("../controllers/auth.controller");

const router = express.Router();

// 🟢 لازم المستخدم يكون لوج إن
router.use(authService.protect);

router.post("/", addToCartValidator, addToCart);
router.get("/", getLoggedUserCart);
router.put("/:itemId", updateCartItemQuantityValidator, updateCartItemQuantity);
router.delete("/:itemId", removeCartItemValidator, removeItemFromCart);
router.delete("/", clearCart);

module.exports = router;
