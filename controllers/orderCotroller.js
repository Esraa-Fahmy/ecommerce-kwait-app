// controllers/orderController.js
const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const Order = require("../models/orderModel");
const Cart = require("../models/cartModel");
const Offer = require("../models/offer.model");
const User = require("../models/user.model");
const Product = require("../models/product.model");
const Address = require("../models/addressModel");
const Shipping = require("../models/shippingModel");


// 🧮 Helper: حساب الإجماليات مع التحقق من صلاحية العروض
const calculateOrderTotals = async (cart, coupon) => {
  let discountValue = 0;
  let totalPrice = 0;

  // 🟡 حساب إجمالي السعر + تطبيق عروض المنتجات
  for (const item of cart.cartItems) {
    let productPrice = item.product.price;

    // ✅ لو فيه عرض خاص بالمنتج
    if (item.product.offer && item.product.offer.isActive) {
      const now = new Date();
      if (
        item.product.offer.startDate <= now &&
        item.product.offer.endDate >= now
      ) {
        if (item.product.offer.offerType === "percentage") {
          const discount = (productPrice * item.product.offer.discountValue) / 100;
          productPrice -= discount;
        } else if (item.product.offer.offerType === "fixed") {
          productPrice -= item.product.offer.discountValue;
        }
      }
    }

    totalPrice += productPrice * item.quantity;
  }

  // ✅ تطبيق كود الخصم (offerCode)
  if (offerCode) {
    const offer = await Offer.findOne({ couponCode: coupon });

    // ❌ لو الكوبون مش موجود
    if (!offer) throw new ApiError("Invalid or expired offer code", 400);

    // ❌ لو العرض انتهى أو غير نشط
    const now = new Date();
    if (!offer.isActive || offer.endDate < now) {
      throw new ApiError("This offer has expired", 400);
    }

    // ✅ تطبيق الخصم
    if (offer.offerType === "percentage") {
      discountValue = (totalPrice * offer.discountValue) / 100;
    } else if (offer.offerType === "fixed") {
      discountValue = offer.discountValue;
    }
  }

  const totalAfterDiscount = Math.max(totalPrice - discountValue, 0);
  const shippingPrice = totalAfterDiscount > 500 ? 0 : 30; // مثال بسيط
  const totalOrderPrice = totalAfterDiscount + shippingPrice;

  return {
    totalPrice,
    discountValue,
    shippingPrice,
    totalOrderPrice,
  };
};

//
// =============================
// 🧾 PREVIEW ORDER (قبل الإنشاء)
// =============================
exports.previewOrder = asyncHandler(async (req, res, next) => {
  const { cartId, coupon } = req.body;
  const cart = await Cart.findById(cartId).populate("cartItems.product");

  if (!cart) return next(new ApiError("Cart not found", 404));

  const totals = await calculateOrderTotals(cart, coupon);

  res.status(200).json({
    message: "Order preview calculated successfully",
    data: {
      products: cart.cartItems,
      ...totals,
    },
  });
});

//
// =============================
// ✅ CREATE ORDER
// =============================
exports.createOrder = asyncHandler(async (req, res, next) => {
  const { cartId, addressId, paymentMethod = "cod", coupon } = req.body;

  const cart = await Cart.findById(cartId).populate("cartItems.product");
  if (!cart) return next(new ApiError("Cart not found", 404));

  const address = await Address.findOne({ _id: addressId, user: req.user._id });
  if (!address) return next(new ApiError("Address not found", 404));

  const shipping = await Shipping.findOne({ city: address.city });
  const shippingCost = shipping ? shipping.cost : 0;

  const totals = await calculateOrderTotals(cart, coupon);

  // ✳️ إنشاء الأوردر
  const order = await Order.create({
    user: req.user._id,
    cart: cart._id,
    cartItems: cart.cartItems,
    address,
    paymentMethod,
    subtotal: totals.totalPrice,
    discountValue: totals.discountValue,
    shippingCost: totals.shippingPrice || shippingCost,
    total: totals.totalOrderPrice,
    coupon,
  });

  // 🔄 تعديل الكميات في المنتجات
  for (const item of cart.cartItems) {
    await Product.findByIdAndUpdate(item.product._id, {
      $inc: { quantity: -item.quantity, sold: item.quantity },
    });
  }

  // 🧹 حذف الكارت بعد الإنشاء
  await Cart.findByIdAndDelete(cart._id);

  res.status(201).json({
    status: "success",
    message: "Order created successfully",
    data: order,
  });
});

//
// =============================
// 📋 GET USER ORDERS
// =============================
exports.getUserOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.status(200).json({ results: orders.length, data: orders });
});

//
// =============================
// 📋 GET ALL ORDERS (Admin)
// =============================
exports.getAllOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find()
    .populate("user", "name email")
    .sort({ createdAt: -1 });
  res.status(200).json({ results: orders.length, data: orders });
});

//
// =============================
// 🧾 GET SINGLE ORDER
// =============================
exports.getOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id).populate("user", "name email");
  if (!order) return next(new ApiError("Order not found", 404));
  res.status(200).json({ data: order });
});

//
// =============================
// ✏️ UPDATE ORDER STATUS (Admin)
// =============================
exports.updateOrderStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;

  const order = await Order.findById(id);
  if (!order) return next(new ApiError("Order not found", 404));

  // 🚫 منع تعديل حالة أوردر تم إلغاؤه
  if (["cancelled_by_user", "cancelled_by_admin"].includes(order.status)) {
    return next(new ApiError("Cannot update a cancelled order", 400));
  }

  order.status = status;
  await order.save();

  res.status(200).json({ message: "Order status updated", data: order });
});

//
// =============================
// ❌ CANCEL ORDER (User)
// =============================
exports.cancelOrder = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const order = await Order.findOne({ _id: id, user: req.user._id });
  if (!order) return next(new ApiError("Order not found", 404));

  if (order.status !== "pending") {
    return next(new ApiError("You can only cancel pending orders", 400));
  }

  order.status = "cancelled_by_user";
  await order.save();

  res.status(200).json({ message: "Order cancelled successfully", data: order });
});
