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



// 👈 دالة لتطبيق الأوفرز وحساب السعر النهائي حسب الكمية
const applyOffersOnItem = async (item) => {
  const product = await Product.findById(item.product)
    .select("title description imageCover colors sizes Material price isWishlist category subCategory subSubCategory")
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
      const freeItems = Math.floor(item.quantity / (offer.buyQuantity + offer.getQuantity)) * offer.getQuantity;
      const paidItems = item.quantity - freeItems;
      finalPrice = paidItems > 0 ? (paidItems * product.price) / item.quantity : 0;
    }
  }

  if (isNaN(finalPrice) || finalPrice < 0) finalPrice = 0;

  item.price = Number(product.price);
  item.priceAfterOffer = Number(finalPrice);

  // snapshot product info
  item.title = product.title;
  item.description = product.description;
  item.imageCover = product.imageCover;
  item.Material = item.Material || product.Material;
  item.colors = product.colors;
  item.sizes = product.sizes;
  item.isWishlist = product.isWishlist || false;

  return item;
};

// 👈 دالة لحساب الإجمالي بعد التحديثات
const recalcCartTotals = async (cart) => {
  let totalCartPrice = 0;
  let totalPriceAfterDiscount = 0;

  for (let i = 0; i < cart.cartItems.length; i++) {
    const item = cart.cartItems[i];
    const updatedItem = await applyOffersOnItem(item);
    const priceUsed = updatedItem.priceAfterOffer || updatedItem.price || 0;
    const qty = updatedItem.quantity || 0;

    totalCartPrice += updatedItem.price * qty;
    totalPriceAfterDiscount += priceUsed * qty;
  }

  cart.totalCartPrice = totalCartPrice;
  cart.totalPriceAfterDiscount = totalPriceAfterDiscount;
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
// بعد حساب الأسعار وتحديث الكارت
const updatedCart = await Cart.findById(cart._id).populate({
  path: "cartItems.product",
  select: "title price description imageCover colors sizes Material isWishlist quantity category subCategory subSubCategory",
});

cart.cartItems = cart.cartItems.map(item => ({
  ...item.toObject(),
  itemId: item._id, // 👈 نرجع الـ id بوضوح
  title: item.product?.title || item.title,
  imageCover: item.product?.imageCover || item.imageCover,
  description: item.product?.description || "",
  Material: item.Material,
  size: item.size,
  color: item.color,
  price: item.price,
  priceAfterOffer: item.priceAfterOffer,
  isWishlist: item.product?.isWishlist || false,
}));

res.status(200).json({
  status: "success",
  message: "Product added to cart successfully",
  data: updatedCart,
});

});


// 🟡 جلب كارت المستخدم
exports.getLoggedUserCart = asyncHandler(async (req, res, next) => {
  let cart = await Cart.findOne({ user: req.user._id }).populate({
    path: "cartItems.product",
    select: "title price description imageCover colors sizes Material isWishlist quantity category subCategory subSubCategory",
  });

  if (!cart) return res.status(200).json({ status: "success", results: 0, data: null });

  // إزالة المنتجات اللي خلصت وتحديث الأسعار بعد العروض
  await removeOutOfStockItems(cart);
  await recalcCartTotals(cart);

  // تحديث الكارت بعد الحفظ لتشمل التفاصيل المطلوبة لكل عنصر
  cart = await Cart.findById(cart._id).populate({
    path: "cartItems.product",
    select: "title price description imageCover colors sizes Material isWishlist quantity category subCategory subSubCategory",
  });

  cart.cartItems = cart.cartItems.map(item => ({
    ...item.toObject(),
    itemId: item._id,
    title: item.product?.title || item.title,
    imageCover: item.product?.imageCover || item.imageCover,
    description: item.product?.description || "",
    Material: item.Material,
    size: item.size,
    color: item.color,
    price: item.price,
    priceAfterOffer: item.priceAfterOffer,
    isWishlist: item.product?.isWishlist || false,
  }));

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

  // ✅ تحقق من المخزون
  if (quantity && quantity > product.quantity) {
    return next(new ApiError(`Only ${product.quantity} items available in stock`, 400));
  }

  // ✅ تحديث الخصائص
  if (quantity) item.quantity = quantity;
  if (color) item.color = color;
  if (size) item.size = size;
  if (material) item.Material = material;

  // ⚙️ إعادة حساب الأسعار بعد أي تغيير و تطبيق العروض
  await recalcCartTotals(cart);

  // تحديث كل منتجات الكارت لتشمل التفاصيل المطلوبة
  const updatedCart = await Cart.findById(cart._id).populate({
    path: "cartItems.product",
    select: "title price description imageCover colors sizes Material isWishlist",
  });

  updatedCart.cartItems = updatedCart.cartItems.map(item => ({
    ...item.toObject(),
    itemId: item._id,
    title: item.product?.title || item.title,
    imageCover: item.product?.imageCover || item.imageCover,
    description: item.product?.description || "",
    Material: item.Material,
    size: item.size,
    color: item.color,
    price: item.price,
    priceAfterOffer: item.priceAfterOffer,
    isWishlist: item.product?.isWishlist || false,
  }));

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
