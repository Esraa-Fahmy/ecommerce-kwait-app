const asyncHandler = require("express-async-handler");
const Cart = require("../models/cartModel");
const Product = require("../models/product.model");
const Offer = require("../models/offer.model");
const ApiError = require("../utils/apiError");

// 🟢 Helper: تطبيق الأوفرز على منتج
const applyOffersOnItem = async (item) => {
  const product = await Product.findById(item.product)
    .populate("category subCategory subSubCategory");

  if (!product) return item;

  const now = new Date();

  // نجيب كل الأوفرز الفعالة
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

const recalcCartTotals = async (cart) => {
  let totalPrice = 0;
  let updatedItems = [];

  for (let item of cart.cartItems) {
    const updatedItem = await applyOffersOnItem(item);
    totalPrice += updatedItem.price * updatedItem.quantity;
    updatedItems.push({
      ...item.toObject(),
      priceAfterOffer: updatedItem.price,
    });
  }

  cart.cartItems = updatedItems;
  cart.totalCartPrice = totalPrice;
  cart.totalPriceAfterDiscount = totalPrice;
  await cart.save();
};




exports.addToCart = asyncHandler(async (req, res, next) => {
  const { productId, color, quantity = 1, size } = req.body;

  const product = await Product.findById(productId);
  if (!product) return next(new ApiError("Product not found", 404));

  let cart = await Cart.findOne({ user: req.user._id });

  const productDetails = {
    product: productId,
    title: product.title,
    imageCover: product.imageCover,
    Material: product.Material,
    size,
    color,
    quantity,
    price: product.price,
  };

  if (!cart) {
    cart = await Cart.create({
      user: req.user._id,
      cartItems: [productDetails],
    });
  } else {
    const existingItemIndex = cart.cartItems.findIndex(
      (item) =>
        item.product.toString() === productId &&
        item.color === color &&
        item.size === size
    );

    if (existingItemIndex > -1) {
      // المنتج موجود بنفس المواصفات، نحدث الكمية فقط
      cart.cartItems[existingItemIndex].quantity += quantity;
    } else {
      cart.cartItems.push(productDetails);
    }
  }

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
    select: "title price imageCover category subCategory subSubCategory",
  });

  if (!cart) return next(new ApiError("No cart found for this user", 404));

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

  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) return next(new ApiError("No cart found for this user", 404));

  const item = cart.cartItems.id(itemId);
  if (!item) return next(new ApiError("Item not found in cart", 404));

  item.quantity = quantity;

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
  );

  if (!cart) return next(new ApiError("Cart not found", 404));

  await recalcCartTotals(cart);

  res.status(200).json({
    status: "success",
    message: "Item removed successfully",
    data: cart,
  });
});

// 🧹 حذف الكارت بالكامل
exports.clearCart = asyncHandler(async (req, res, next) => {
  await Cart.findOneAndDelete({ user: req.user._id });

  res.status(204).json({
    status: "success",
    message: "Cart cleared successfully",
    data: null,
  });
});
