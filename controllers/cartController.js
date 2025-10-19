const asyncHandler = require("express-async-handler");
const Cart = require("../models/cartModel");
const Product = require("../models/product.model");
const Offer = require("../models/offer.model");
const ApiError = require("../utils/apiError");

// 🧹 إزالة المنتجات اللي خلصت من المخزون
const removeOutOfStockItems = async (cart) => {
  const before = cart.cartItems.length;
  cart.cartItems = cart.cartItems.filter(
    (item) => item.product && item.product.quantity > 0
  );
  if (cart.cartItems.length !== before) {
    await cart.save();
  }
};

// 🏷 تطبيق الأوفرز (function داخلية مش endpoint)
const applyOffersOnItem = async (item) => {
  const product = await Product.findById(item.product)
    .populate("category subCategory subSubCategory");

  if (!product) return item;

  const now = new Date();
  const offers = await Offer.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    $or: [
      { targetType: "product", targetIds: product._id },
      { targetType: "subcategory", targetIds: product.subCategory },
      { targetType: "subSubcategory", targetIds: product.subSubCategory },
      { targetType: "category", targetIds: product.category },
    ],
  }).sort({ priority: -1 });

  if (offers.length === 0) return item;

  const offer = offers[0];
  let finalPrice = product.price;

  if (offer.offerType === "percentage") {
    finalPrice = product.price - (product.price * offer.discountValue) / 100;
  } else if (offer.offerType === "fixed") {
    finalPrice = product.price - offer.discountValue;
  } else if (offer.offerType === "buyXgetY" && item.quantity >= offer.buyQuantity) {
    const freeItems = Math.floor(item.quantity / (offer.buyQuantity + offer.getQuantity)) * offer.getQuantity;
    const paidItems = item.quantity - freeItems;
    finalPrice = (paidItems * product.price) / item.quantity;
  }

  if (finalPrice < 0) finalPrice = 0;

  return { ...item, price: finalPrice };
};

// ⚙ حساب إجمالي الكارت مع العروض
const recalcCartTotals = async (cart) => {
  let totalPrice = 0;
  let updatedItems = [];

  for (let item of cart.cartItems) {
    const updatedItem = await applyOffersOnItem(item);
    totalPrice += updatedItem.price * updatedItem.quantity;
    updatedItems.push(updatedItem);
  }

  cart.cartItems = updatedItems;
  cart.totalCartPrice = totalPrice;
  cart.totalPriceAfterDiscount = totalPrice;

  await cart.save();
};

// 🟢 إضافة منتج للكارت
exports.addToCart = asyncHandler(async (req, res, next) => {
  const { productId, color, quantity = 1 } = req.body;

  const product = await Product.findById(productId);
  if (!product) return next(new ApiError("Product not found", 404));

  // 🧠 تأكد إن المنتج متاح في المخزون
  if (product.quantity <= 0) {
    return next(new ApiError("This product is out of stock", 400));
  }

  let cart = await Cart.findOne({ user: req.user._id }).populate("cartItems.product");

  if (!cart) {
    cart = await Cart.create({
      user: req.user._id,
      cartItems: [{ product: productId, color, quantity, price: product.price }],
    });
  } else {
    const itemIndex = cart.cartItems.findIndex(
      (item) => item.product._id.toString() === productId && item.color === color
    );

    if (itemIndex > -1) {
      cart.cartItems[itemIndex].quantity += quantity;
    } else {
      cart.cartItems.push({ product: productId, color, quantity, price: product.price });
    }
  }

  await removeOutOfStockItems(cart);
  await recalcCartTotals(cart);

  res.status(200).json({
    status: "success",
    message: "Product added to cart successfully",
    data: cart,
  });
});

// 🟡 جلب كارت المستخدم
exports.getLoggedUserCart = asyncHandler(async (req, res, next) => {
  const cart = await Cart.findOne({ user: req.user._id }).populate({
    path: "cartItems.product",
    select: "title price imageCover colors sizes Material quantity category subCategory subSubCategory",
  });

  if (!cart) return next(new ApiError("No cart found for this user", 404));

  await removeOutOfStockItems(cart);
  await recalcCartTotals(cart);

  res.status(200).json({
    status: "success",
    results: cart.cartItems.length,
    data: cart,
  });
});

// 🔵 تعديل كمية منتج داخل الكارت
exports.updateCartItemQuantity = asyncHandler(async (req, res, next) => {
  const { itemId } = req.params;
  const { quantity } = req.body;

  const cart = await Cart.findOne({ user: req.user._id }).populate("cartItems.product");
  if (!cart) return next(new ApiError("No cart found for this user", 404));

  const item = cart.cartItems.id(itemId);
  if (!item) return next(new ApiError("Item not found in cart", 404));

  // تأكد إن الكمية متاحة في المخزون
  if (item.product.quantity < quantity) {
    return next(new ApiError("Not enough stock for this product", 400));
  }

  item.quantity = quantity;
  await removeOutOfStockItems(cart);
  await recalcCartTotals(cart);

  res.status(200).json({
    status: "success",
    message: "Quantity updated successfully",
    data: cart,
  });
});

// 🔴 حذف منتج من الكارت
exports.removeItemFromCart = asyncHandler(async (req, res, next) => {
  const { itemId } = req.params;

  const cart = await Cart.findOneAndUpdate(
    { user: req.user._id },
    { $pull: { cartItems: { _id: itemId } } },
    { new: true }
  ).populate("cartItems.product");

  if (!cart) return next(new ApiError("Cart not found", 404));

  await recalcCartTotals(cart);

  res.status(200).json({
    status: "success",
    message: "Item removed successfully",
    data: cart,
  });
});

// 🧺 حذف الكارت بالكامل
exports.clearCart = asyncHandler(async (req, res, next) => {
  await Cart.findOneAndDelete({ user: req.user._id });

  res.status(204).json({
    status: "success",
    message: "Cart cleared successfully",
    data: null,
  });
});