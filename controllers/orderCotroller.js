const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const Order = require("../models/orderModel");
const Cart = require("../models/cartModel");
const Offer = require("../models/offer.model");
const Product = require("../models/product.model");
const Address = require("../models/addressModel");
const Shipping = require("../models/shippingModel");
const User = require("../models/user.model");
const { sendNotification } = require("../utils/sendNotifications");



// 🧮 Helper: حساب الإجماليات + الخصومات + الكوبونات
const calculateOrderTotals = async (cart, coupon, user) => {
  let discountValue = 0;
  let totalPrice = 0;
  let couponMessage = null;

  // 🟡 حساب إجمالي السعر + تطبيق عروض المنتجات
  for (const item of cart.cartItems) {
    let productPrice = item.product.price;

    // ✅ لو فيه عرض على المنتج
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

  // ✅ تطبيق كود الخصم (الكوبون)
 // ✅ تطبيق كود الخصم (الكوبون)
if (coupon) {
  const offer = await Offer.findOne({ couponCode: coupon });
  const now = new Date();

  if (!offer) {
    couponMessage = "❌ هذا الكود غير صحيح أو غير موجود.";
  } else if (!offer.isActive) {
    couponMessage = "⚠️ هذا الكود غير مفعل حالياً.";
  } else if (offer.startDate > now) {
    couponMessage = "⚠️ هذا الكود لم يبدأ بعد.";
  } else if (offer.endDate < now) {
    couponMessage = "⚠️ انتهت صلاحية هذا الكود.";
  } else if (offer.targetType !== "cart") {
    couponMessage = "⚠️ هذا الكود غير مخصص لتطبيقه على السلة.";
  } else {
    // ✅ الكود صالح ومخصص للسلة
    if (offer.offerType === "coupon" || offer.offerType === "percentage") {
      // لو الخصم نسبة
      discountValue = totalPrice * offer.discountValue;
      couponMessage = `✅ تم تطبيق خصم بنسبة ${(offer.discountValue * 100).toFixed(0)}%.`;
    } else if (offer.offerType === "fixed") {
      // لو خصم ثابت
      discountValue = offer.discountValue;
      couponMessage = `✅ تم تطبيق خصم بقيمة ${offer.discountValue} ج.م.`;
    } else {
      couponMessage = "⚠️ نوع العرض غير مدعوم لهذا الكوبون.";
    }
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
    couponMessage,
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

  const totals = await calculateOrderTotals(cart, coupon, req.user);

  res.status(200).json({
    status: "success",
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

  const totals = await calculateOrderTotals(cart, coupon, req.user);

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

   await order.populate("user", "firstName lastName email phone");

  // 🔄 تعديل الكميات في المنتجات
  for (const item of cart.cartItems) {
    await Product.findByIdAndUpdate(item.product._id, {
      $inc: { quantity: -item.quantity, sold: item.quantity },
    });
  }

  // 🧹 حذف الكارت بعد الإنشاء
  await Cart.findByIdAndDelete(cart._id);

  await sendNotification(
  req.user._id,
  "تم إنشاء الطلب بنجاح",
  `تم إنشاء طلبك رقم ${order._id} بنجاح، بإجمالي ${order.total} جنيه.`,
  "order"
);

  res.status(201).json({
    status: "success",
    message: totals.couponMessage || "Order created successfully",
    data: order,
  });
});


//
// =============================
// 📋 GET USER ORDERS
// =============================
exports.getUserOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id })
    .populate("user", "firstName lastName email phone")
    .sort({ createdAt: -1 });
  res.status(200).json({ results: orders.length, data: orders });
});


//
// =============================
// 📋 GET ALL ORDERS (Admin)
// =============================
exports.getAllOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find()
    .populate("user", "firstName lastName email phone")
    .sort({ createdAt: -1 });
  res.status(200).json({ results: orders.length, data: orders });
});


//
// =============================
// 🧾 GET SINGLE ORDER
// =============================
exports.getOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id).populate("user", "firstName lastName email phone");

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

  if (["cancelled_by_user", "cancelled_by_admin"].includes(order.status)) {
    return next(new ApiError("Cannot update a cancelled order", 400));
  }

  order.status = status;
  await order.save();

await sendNotification(
  order.user._id,
  "تم تحديث حالة الطلب",
  `تم تغيير حالة طلبك رقم ${order._id} إلى "${order.status}".`,
  "order"
);
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


  await sendNotification(
  req.user._id,
  "تم إلغاء الطلب",
  `لقد تم إلغاء طلبك رقم ${order._id} بنجاح.`,
  "order"
);

  res.status(200).json({ message: "Order cancelled successfully", data: order });
});
