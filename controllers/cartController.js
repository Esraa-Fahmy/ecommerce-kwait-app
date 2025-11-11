// controllers/cartController.js
const asyncHandler = require("express-async-handler");
const Cart = require("../models/cartModel");
const Product = require("../models/product.model");
const Offer = require("../models/offer.model");
const ApiError = require("../utils/apiError");

// 🧹 إزالة المنتجات اللي خلصت من المخزون
const removeOutOfStockItems = async (cart) => {
  for (let i = 0; i < cart.cartItems.length; i++) {
    const item = cart.cartItems[i];
    const prod = await Product.findById(item.product);
    if (!prod || prod.quantity <= 0) {
      cart.cartItems.splice(i, 1);
      i--;
    }
  }
  await cart.save();
};

// 🏷 تطبيق الأوفرز على عنصر (function داخلية)
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

  // price baseline
  let finalPrice = Number(product.price) || 0;

  if (offers.length > 0) {
    const offer = offers[0];
    if (offer.offerType === "percentage" && typeof offer.discountValue === "number") {
      finalPrice = product.price - (product.price * offer.discountValue) / 100;
    } else if (offer.offerType === "fixed" && typeof offer.discountValue === "number") {
      finalPrice = product.price - offer.discountValue;
    } else if (
      offer.offerType === "buyXgetY" &&
      typeof offer.buyQuantity === "number" &&
      typeof offer.getQuantity === "number" &&
      item.quantity >= offer.buyQuantity
    ) {
      // compute average price per item after free items calculation
      const freeItems = Math.floor(item.quantity / (offer.buyQuantity + offer.getQuantity)) * offer.getQuantity;
      const paidItems = item.quantity - freeItems;
      finalPrice = paidItems > 0 ? (paidItems * product.price) / item.quantity : 0;
    }
  }

  if (isNaN(finalPrice) || finalPrice < 0) finalPrice = 0;

  // set both price (original per-item) and priceAfterOffer
  item.price = Number(product.price);
  item.priceAfterOffer = Number(finalPrice);

  // attach a snapshot of selected attributes & product meta (so cart keeps needed info)
  item.title = product.title;
  item.imageCover = product.imageCover;
  item.Material = product.Material;
  item.colors = product.colors;
  item.sizes = product.sizes;

  return item;
};

// ⚙️ إعادة حساب الإجمالي بعد العروض
const recalcCartTotals = async (cart) => {
  let totalPrice = 0;
  let totalAfter = 0;

  // update each item prices according to offers
  for (let i = 0; i < cart.cartItems.length; i++) {
    const item = cart.cartItems[i];
    const updatedItem = await applyOffersOnItem(item);
    const priceUsed = Number(updatedItem.priceAfterOffer ?? updatedItem.price ?? 0);
    const qty = Number(updatedItem.quantity ?? 0);
    const itemTotal = priceUsed * qty;

    if (!isNaN(itemTotal)) {
      totalPrice += (Number(updatedItem.price ?? 0) * qty); // sum original prices (optional)
      totalAfter += itemTotal;
    }
  }

  cart.totalCartPrice = Number(totalAfter) || 0; // final amount shown in cart
  cart.totalPriceAfterDiscount = Number(totalAfter) || 0;
  await cart.save();
};

// 🟢 إضافة منتج للكارت
exports.addToCart = asyncHandler(async (req, res, next) => {
  const { productId, color, size, material, quantity = 1 } = req.body;

  if (req.user && req.user.role === "admin") {
    return next(new ApiError("Admin cannot add products to cart", 403));
  }

  const product = await Product.findById(productId);
  if (!product) return next(new ApiError("Product not found", 404));

  // التحقق من الخيارات والمخزون (كما في الكود السابق)
  if (Array.isArray(product.colors) && product.colors.length > 0 && !color) {
    return next(new ApiError("You must select a color for this product", 400));
  }
  if (Array.isArray(product.sizes) && product.sizes.length > 0 && !size) {
    return next(new ApiError("You must select a size for this product", 400));
  }
  if (product.Material && Array.isArray(product.Material) && product.Material.length > 0 && !material) {
    return next(new ApiError("You must select a material for this product", 400));
  }
  if (product.quantity <= 0) return next(new ApiError("This product is out of stock", 400));
  if (quantity > product.quantity) return next(new ApiError(`Only ${product.quantity} items available in stock`, 400));

  let cart = await Cart.findOne({ user: req.user._id }).populate("cartItems.product");

  if (!cart) {
    cart = await Cart.create({
      user: req.user._id,
      cartItems: [{
        product: productId,
        title: product.title,
        imageCover: product.imageCover,
        Material: material,
        size,
        color,
        quantity,
        price: product.price,
        priceAfterOffer: product.price,
      }]
    });
  } else {
    const itemIndex = cart.cartItems.findIndex(item => {
      const sameProduct = item.product._id.toString() === productId;
      const sameColor = (item.color || "") === (color || "");
      const sameSize = (item.size || "") === (size || "");
      const sameMaterial = (item.Material || "") === (material || "");
      return sameProduct && sameColor && sameSize && sameMaterial;
    });

    if (itemIndex > -1) {
      const existing = cart.cartItems[itemIndex];
      const newTotalQty = Number(existing.quantity || 0) + Number(quantity);
      if (newTotalQty > product.quantity) {
        return next(new ApiError(`Only ${product.quantity} items available in stock`, 400));
      }
      existing.quantity = newTotalQty;
    } else {
      cart.cartItems.push({
        product: productId,
        title: product.title,
        imageCover: product.imageCover,
        Material: material,
        size,
        color,
        quantity,
        price: product.price,
        priceAfterOffer: product.price,
      });
    }
  }

  await removeOutOfStockItems(cart);
  await recalcCartTotals(cart);

  // إعادة الجلب مع populate + description
  const updatedCart = await Cart.findById(cart._id).populate({
    path: "cartItems.product",
    select: "title price imageCover colors sizes Material quantity category subCategory subSubCategory description"
  });

  // map لإضافة itemId و isWishlist
  updatedCart.cartItems = updatedCart.cartItems.map(item => {
    const product = item.product ? item.product.toObject() : {};
    const isWishlist = req.user.wishlist ? req.user.wishlist.includes(item.product._id) : false;
    return {
      ...item.toObject(),
      itemId: item._id,
      product: {
        ...product,
        isWishlist
      }
    };
  });

  res.status(200).json({
    status: "success",
    message: "Product added to cart successfully",
    data: updatedCart,
  });
});


// 🟡 جلب كارت المستخدم
exports.getLoggedUserCart = asyncHandler(async (req, res, next) => {
  if (!req.user) return next(new ApiError("User not logged in", 401));

  let cart = await Cart.findOne({ user: req.user._id }).populate({
    path: "cartItems.product",
    select: "title price imageCover colors sizes Material quantity category subCategory subSubCategory description"
  });

  if (!cart) return res.status(200).json({ status: "success", results: 0, data: null });

  // إزالة العناصر منتهية المخزون
  await removeOutOfStockItems(cart);
  // إعادة حساب الأسعار بعد الأوفرز
  await recalcCartTotals(cart);

  // إعادة جلب الكارت بعد التحديث
  cart = await Cart.findById(cart._id).populate({
    path: "cartItems.product",
    select: "title price imageCover colors sizes Material quantity category subCategory subSubCategory description"
  });

  // map لإضافة itemId و isWishlist
  cart.cartItems = cart.cartItems.map(item => {
    const product = item.product ? item.product.toObject() : {};

    // isWishlist للمستخدم
    const isWishlist = req.user.wishlist
      ? req.user.wishlist.includes(item.product._id)
      : false;

    return {
      ...item.toObject(),
      itemId: item._id,
      product: {
        ...product,
        isWishlist
      }
    };
  });

  res.status(200).json({
    status: "success",
    results: cart.cartItems.length,
    data: cart,
  });
});


exports.updateCartItem = asyncHandler(async (req, res, next) => {
  const { itemId } = req.params;
  const { quantity, color, size, material } = req.body;

  if (req.user.role === "admin") {
    return next(new ApiError("Admin cannot modify cart", 403));
  }

  const cart = await Cart.findOne({ user: req.user._id }).populate("cartItems.product");
  if (!cart) return next(new ApiError("No cart found for this user", 404));

  const item = cart.cartItems.id(itemId);
  if (!item) return next(new ApiError("Item not found in cart", 404));

  const product = await Product.findById(item.product);
  if (!product) return next(new ApiError("Product not found", 404));

  if (quantity && quantity > product.quantity) {
    return next(new ApiError(`Only ${product.quantity} items available in stock`, 400));
  }

  if (quantity) item.quantity = quantity;
  if (color) item.color = color;
  if (size) item.size = size;
  if (material) item.Material = material;

  await recalcCartTotals(cart);

  const updatedCart = await Cart.findById(cart._id).populate({
    path: "cartItems.product",
    select: "title price imageCover colors sizes Material quantity category subCategory subSubCategory description"
  });

  updatedCart.cartItems = updatedCart.cartItems.map(item => {
    const product = item.product ? item.product.toObject() : {};
    const isWishlist = req.user.wishlist ? req.user.wishlist.includes(item.product._id) : false;
    return {
      ...item.toObject(),
      itemId: item._id,
      product: {
        ...product,
        isWishlist
      }
    };
  });

  res.status(200).json({
    status: "success",
    message: "Cart item updated successfully",
    data: updatedCart,
  });
});


// 🔴 حذف منتج من الكارت
exports.removeItemFromCart = asyncHandler(async (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    return next(new ApiError("Admin cannot modify cart", 403));
  }

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
  if (req.user && req.user.role === "admin") {
    return next(new ApiError("Admin cannot clear cart", 403));
  }

  await Cart.findOneAndDelete({ user: req.user._id });

  res.status(204).json({
    status: "success",
    message: "Cart cleared successfully",
    data: [],
  });
});
