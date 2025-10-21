const express = require("express");
const {
  addToCart,
  getLoggedUserCart,
  updateCartItem,
  removeItemFromCart,
  clearCart,
} = require("../controllers/cartController");

const {
  addToCartValidator,
  updateCartItemValidator,
  removeCartItemValidator,
} = require("../validators/cart.validation");

const authService = require("../controllers/auth.controller");

const router = express.Router();

// 🟢 لازم المستخدم يكون لوج إن
router.use(authService.protect);

router.post("/", addToCartValidator, addToCart);
router.get("/", getLoggedUserCart);
router.put("/:itemId", updateCartItemValidator, updateCartItem);
router.delete("/:itemId", removeCartItemValidator, removeItemFromCart);
router.delete("/", clearCart);

module.exports = router;
