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

// 🏷 تطبيق الأوفرز على عنصر
const applyOffersOnItem = async (item) => {
  const product = await Product.findById(item.product)
    .populate("category subCategory subSubCategory");

  if (!product) return item;

  const now = new Date();
  
  // ✅ البحث عن العروض النشطة (بدأت بالفعل)
  const activeOffers = await Offer.find({
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

  // ✅ البحث عن العروض القادمة (لم تبدأ بعد)
  const upcomingOffers = await Offer.find({
    isActive: true,
    startDate: { $gt: now },
    endDate: { $gte: now },
    $or: [
      { targetType: "product", targetIds: product._id },
      { targetType: "subcategory", targetIds: product.subCategory },
      { targetType: "subSubcategory", targetIds: product.subSubCategory },
      { targetType: "category", targetIds: product.category },
    ],
  }).sort({ startDate: 1 });

  let finalPrice = Number(product.price) || 0;
  let appliedOffer = null;

  if (activeOffers.length > 0) {
    const offer = activeOffers[0];
    appliedOffer = {
      _id: offer._id,
      title: offer.title,
      offerType: offer.offerType,
      discountValue: offer.discountValue,
    };

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
      appliedOffer.buyQuantity = offer.buyQuantity;
      appliedOffer.getQuantity = offer.getQuantity;
      
      const freeItems = Math.floor(item.quantity / (offer.buyQuantity + offer.getQuantity)) * offer.getQuantity;
      const paidItems = item.quantity - freeItems;
      finalPrice = paidItems > 0 ? (paidItems * product.price) / item.quantity : 0;
      
      appliedOffer.freeItems = freeItems;
      appliedOffer.paidItems = paidItems;
    }
  }

  if (isNaN(finalPrice) || finalPrice < 0) finalPrice = 0;

  item.price = Number(product.price);
  item.priceAfterOffer = Number(finalPrice);
  item.title = product.title;
  item.imageCover = product.imageCover;
  item.Material = product.Material;
  item.colors = product.colors;
  item.sizes = product.sizes;

  // ✅ السعر الكلي حسب الكمية لكل عنصر
  item.priceTotal = Number(item.priceAfterOffer * item.quantity);

  // ✅ معلومات العروض
  if (appliedOffer) {
    item.appliedOffer = appliedOffer;
  }
  
  if (upcomingOffers.length > 0) {
    item.upcomingOffers = upcomingOffers.map(offer => ({
      _id: offer._id,
      title: offer.title,
      offerType: offer.offerType,
      startDate: offer.startDate,
      endDate: offer.endDate,
      discountValue: offer.discountValue,
      buyQuantity: offer.buyQuantity,
      getQuantity: offer.getQuantity,
    }));
  }

  // attach product snapshot
  item.product = product;

  return item;
};

// ⚙️ إعادة حساب الإجمالي بعد العروض
const recalcCartTotals = async (cart) => {
  let totalPrice = 0;
  let totalAfter = 0;

  // حساب إجمالي المنتجات بعد تطبيق العروض على كل منتج
  for (let i = 0; i < cart.cartItems.length; i++) {
    const item = cart.cartItems[i];
    const updatedItem = await applyOffersOnItem(item);
    const priceUsed = Number(updatedItem.priceAfterOffer ?? updatedItem.price ?? 0);
    const qty = Number(updatedItem.quantity ?? 0);
    const itemTotal = priceUsed * qty;

    if (!isNaN(itemTotal)) {
      totalPrice += Number(updatedItem.price ?? 0) * qty;
      totalAfter += itemTotal;
    }
    
    // ✅ حفظ معلومات العرض المطبق في الكارت
    cart.cartItems[i].price = updatedItem.price;
    cart.cartItems[i].priceAfterOffer = updatedItem.priceAfterOffer;
    cart.cartItems[i].priceTotal = updatedItem.priceTotal;
    cart.cartItems[i].appliedOffer = updatedItem.appliedOffer || null;
    cart.cartItems[i].upcomingOffers = updatedItem.upcomingOffers || [];
  }

  // ✅ البحث عن عروض على مستوى السلة (cartDiscount, freeShipping)
  const now = new Date();
  const cartOffers = await Offer.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    targetType: "cart",
    $or: [
      { offerType: "cartDiscount" },
      { offerType: "freeShipping" }
    ]
  }).sort({ priority: -1 });

  let cartDiscountValue = 0;
  let hasFreeShipping = false;

  if (cartOffers.length > 0) {
    for (const offer of cartOffers) {
      // تطبيق خصم السلة
      if (offer.offerType === "cartDiscount") {
        // التحقق من الحد الأدنى لقيمة السلة
        if (!offer.minCartValue || totalAfter >= offer.minCartValue) {
          if (offer.discountValue) {
            cartDiscountValue = totalAfter * (offer.discountValue / 100);
          }
        }
      }
      // تطبيق الشحن المجاني
      else if (offer.offerType === "freeShipping") {
        if (!offer.minCartValue || totalAfter >= offer.minCartValue) {
          hasFreeShipping = true;
        }
      }
    }
  }

  // تطبيق خصم السلة على الإجمالي
  totalAfter = Math.max(totalAfter - cartDiscountValue, 0);

  cart.totalCartPrice = Number(totalAfter) || 0;
  cart.totalPriceAfterDiscount = Number(totalAfter) || 0;
  cart.hasFreeShipping = hasFreeShipping; // حفظ حالة الشحن المجاني
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

  if (Array.isArray(product.colors) && product.colors.length > 0 && !color)
    return next(new ApiError("You must select a color for this product", 400));
  if (Array.isArray(product.sizes) && product.sizes.length > 0 && !size)
    return next(new ApiError("You must select a size for this product", 400));
  if (product.Material && Array.isArray(product.Material) && product.Material.length > 0 && !material)
    return next(new ApiError("You must select a material for this product", 400));

  if (product.quantity <= 0)
    return next(new ApiError("This product is out of stock", 400));
  if (quantity > product.quantity)
    return next(new ApiError(`Only ${product.quantity} items available in stock`, 400));

  let cart = await Cart.findOne({ user: req.user._id }).populate("cartItems.product");

  if (!cart) {
    cart = await Cart.create({
      user: req.user._id,
      cartItems: [
        {
          product: productId,
          title: product.title,
          imageCover: product.imageCover,
          Material: material,
          size,
          color,
          quantity,
          price: product.price,
          priceAfterOffer: product.price,
          priceTotal: product.price * quantity, // 👈 السعر الكلي حسب الكمية
        },
      ],
    });
  } else {
  const itemIndex = cart.cartItems.findIndex((item) => {
  const sameProduct =
    (item.product?._id?.toString() || item.product.toString()) === productId;

  // لو المنتج مفيهوش ألوان → تجاهل مقارنة اللون
  const sameColor = Array.isArray(product.colors) && product.colors.length > 0
    ? (item.color || "") === (color || "")
    : true;

  // لو المنتج مفيهوش مقاسات → تجاهل مقارنة المقاس
  const sameSize = Array.isArray(product.sizes) && product.sizes.length > 0
    ? (item.size || "") === (size || "")
    : true;

  // لو المنتج مفيهوش Material → تجاهل المقارنة
  const sameMaterial = Array.isArray(product.Material) && product.Material.length > 0
    ? (item.Material || "") === (material || "")
    : true;

  return sameProduct && sameColor && sameSize && sameMaterial;
});



    if (itemIndex > -1) {
      const existing = cart.cartItems[itemIndex];
      const newTotalQty = Number(existing.quantity || 0) + Number(quantity || 0);
      if (newTotalQty > product.quantity)
        return next(new ApiError(`Only ${product.quantity} items available in stock`, 400));
      existing.quantity = newTotalQty;
      existing.priceTotal = Number(existing.priceAfterOffer * existing.quantity); // 👈 تحديث السعر الكلي
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
        priceTotal: product.price * quantity, // 👈 السعر الكلي حسب الكمية
      });
    }
  }

  await removeOutOfStockItems(cart);
  await recalcCartTotals(cart);

  const updatedCart = await Cart.findById(cart._id).populate({
    path: "cartItems.product",
    select: "title description price imageCover colors sizes Material isWishlist",
  });

  updatedCart.cartItems = updatedCart.cartItems.map(item => ({
    ...item.toObject(),
    itemId: item._id,
    priceTotal: Number((item.priceAfterOffer || item.price) * (item.quantity || 1)),
    description: item.product?.description || "",
    isWishlist: item.product?.isWishlist || false,
  }));

  res.status(200).json({
    status: "success",
    message: "Product added to cart successfully",
    data: updatedCart,
  });
});

// 🟡 جلب كارت المستخدم
// 🟡 جلب كارت المستخدم
exports.getLoggedUserCart = asyncHandler(async (req, res, next) => {
  let cart = await Cart.findOne({ user: req.user._id }).populate({
    path: "cartItems.product",
    select: "title description price imageCover colors sizes Material isWishlist",
  });

  // ✅ لو مفيش كارت خالص، ارجع array فاضي
  if (!cart) {
    return res.status(200).json({ 
      status: "success", 
      results: 0, 
      data: {
        cartItems: [],
        totalCartPrice: 0,
        totalPriceAfterDiscount: 0
      }
    });
  }

  await removeOutOfStockItems(cart);
  await recalcCartTotals(cart);

  cart = await Cart.findById(cart._id).populate({
    path: "cartItems.product",
    select: "title description price imageCover colors sizes Material isWishlist",
  });

  // ✅ لو الكارت موجود بس فاضي، ارجع array فاضي
  if (!cart.cartItems || cart.cartItems.length === 0) {
    return res.status(200).json({
      status: "success",
      results: 0,
      data: {
        cartItems: [],
        totalCartPrice: 0,
        totalPriceAfterDiscount: 0
      }
    });
  }

  cart.cartItems = cart.cartItems.map(item => ({
    ...item.toObject(),
    itemId: item._id,
    priceTotal: Number((item.priceAfterOffer || item.price) * (item.quantity || 1)),
    description: item.product?.description || "",
    isWishlist: item.product?.isWishlist || false,
  }));

  res.status(200).json({
    status: "success",
    results: cart.cartItems.length,
    data: cart,
  });
});

// 🔄 تحديث عنصر الكارت
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

  if (quantity && quantity > product.quantity)
    return next(new ApiError(`Only ${product.quantity} items available in stock`, 400));

  if (quantity) item.quantity = quantity;
  if (color) item.color = color;
  if (size) item.size = size;
  if (material) item.Material = material;

  item.priceTotal = Number((item.priceAfterOffer || item.price) * item.quantity); // 👈 تحديث السعر الكلي لكل عنصر

  await recalcCartTotals(cart);

  const updatedCart = await Cart.findById(cart._id).populate("cartItems.product");

  updatedCart.cartItems = updatedCart.cartItems.map(item => ({
    ...item.toObject(),
    itemId: item._id,
    priceTotal: Number((item.priceAfterOffer || item.price) * (item.quantity || 1)),
    description: item.product?.description || "",
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
