// controllers/orderController.js - Updated for Visa Payment
const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const Order = require("../models/orderModel");
const Cart = require("../models/cartModel");
const Offer = require("../models/offer.model");
const Product = require("../models/product.model");
const Address = require("../models/addressModel");
const Shipping = require("../models/shippingModel");
const { sendNotification } = require("../utils/sendNotifications");

// 🧮 Helper: حساب الإجماليات
const calculateOrderTotals = async (cart, coupon, user, city) => {
  let discountValue = 0;
  let totalPrice = 0;
  let couponMessage = null;

  // ✅ استخدام priceAfterOffer من السلة (يحتوي على كل العروض: percentage, fixed, buyXgetY)
  for (const item of cart.cartItems) {
    // استخدام priceAfterOffer إذا كان موجود، وإلا استخدام السعر العادي
    const itemPrice = item.priceAfterOffer || item.price || 0;
    totalPrice += itemPrice * item.quantity;
  }

  // ✅ تطبيق كوبون الخصم (إن وجد)
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
    } else if (offer.offerType !== "coupon" && offer.offerType !== "percentage" && offer.offerType !== "fixed") {
      couponMessage = "⚠️ هذا الكود غير صالح للسلة.";
    } else {
      // ✅ تطبيق الخصم
      if (offer.offerType === "coupon" || offer.offerType === "percentage") {
        // ✅ دعم النسب العشرية: لو القيمة أقل من 1، اضربها في 100 عشان تبقى نسبة مئوية
        // مثال: 0.1 → 10%، 0.25 → 25%
        // لو القيمة 1 أو أكبر، استخدمها مباشرة كنسبة مئوية
        // مثال: 10 → 10%، 25 → 25%
        const discountPercentage = offer.discountValue < 1 
          ? offer.discountValue * 100 
          : offer.discountValue;
        
        discountValue = totalPrice * (discountPercentage / 100);
        couponMessage = `✅ تم تطبيق خصم بنسبة ${discountPercentage}%.`;
      } else if (offer.offerType === "fixed") {
        discountValue = offer.discountValue;
        couponMessage = `✅ تم تطبيق خصم بقيمة ${offer.discountValue} د.ك.`;
      }
    }
  }

  const totalAfterDiscount = Math.max(totalPrice - discountValue, 0);
  
  // ✅ حساب تكلفة الشحن (مع التحقق من الشحن المجاني)
  let shippingPrice = 0;
  let hasFreeShipping = cart.hasFreeShipping || false;

  // التحقق من عروض الشحن المجاني على مستوى الأوردر
  if (!hasFreeShipping && city) {
    const now = new Date();
    const freeShippingOffer = await Offer.findOne({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      offerType: "freeShipping",
      $or: [
        { targetType: "cart" },
        { targetType: "order" }
      ]
    });

    if (freeShippingOffer) {
      // التحقق من الحد الأدنى لقيمة السلة
      if (!freeShippingOffer.minCartValue || totalAfterDiscount >= freeShippingOffer.minCartValue) {
        hasFreeShipping = true;
      }
    }
  }

  // حساب تكلفة الشحن إذا لم يكن مجاني
  if (!hasFreeShipping && city) {
    const shipping = await Shipping.findOne({ city });
    shippingPrice = shipping ? shipping.cost : 0;
  }

  const totalOrderPrice = totalAfterDiscount + shippingPrice;

  return {
    totalPrice,
    discountValue,
    shippingPrice,
    totalOrderPrice,
    couponMessage,
    hasFreeShipping,
  };
};

// =============================
// 🧾 PREVIEW ORDER
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

// =============================
// ✅ CREATE ORDER (Updated for Visa)
// =============================
exports.createOrder = asyncHandler(async (req, res, next) => {
  const { cartId, addressId, paymentMethod = "cod", coupon } = req.body;

  if (!["cod", "visa"].includes(paymentMethod)) {
    return next(new ApiError("Invalid payment method", 400));
  }

  const cart = await Cart.findById(cartId).populate("cartItems.product");
  if (!cart) return next(new ApiError("Cart not found", 404));

  const address = await Address.findOne({ _id: addressId, user: req.user._id });
  if (!address) return next(new ApiError("Address not found", 404));

  const shipping = await Shipping.findOne({ city: address.city });
  const shippingCost = shipping ? shipping.cost : 0;

  const totals = await calculateOrderTotals(cart, coupon, req.user, address.city);

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
    paymentDetails: {
      status: paymentMethod === "visa" ? "pending" : "paid",
      initiatedAt: new Date(),
    },
  });

  await order.populate("user", "firstName lastName email phone");

  // ----------------------------
  // ✅ تفريغ الكارت فوراً بعد إنشاء الأوردر
  // ----------------------------
  await Cart.findByIdAndDelete(cart._id);

  // لو COD خصم الكميات
  if (paymentMethod === "cod") {
    for (const item of order.cartItems) {
      await Product.findByIdAndUpdate(item.product._id, {
        $inc: { quantity: -item.quantity, sold: item.quantity },
      });
    }

    await sendNotification(
      req.user._id,
      "تم إنشاء الطلب بنجاح",
      `تم إنشاء طلبك رقم ${order._id} بنجاح، بإجمالي ${order.total} د.ك.`,
      "order"
    );
  }

  let orderResponse = order.toObject(); // تحويل الـ mongoose document إلى object

  // تحويل product من object كامل إلى id فقط
  orderResponse.cartItems = orderResponse.cartItems.map(item => ({
    ...item,
    product: item.product._id || item.product
  }));

  // ✅ إزالة paymentDetails في حالة COD
  if (paymentMethod === "cod") {
    const { paymentDetails, ...orderWithoutPaymentDetails } = orderResponse;
    orderResponse = orderWithoutPaymentDetails;
  }

  res.status(201).json({
    status: "success",
    message: paymentMethod === "visa" ? "Order created. Please complete payment." : totals.couponMessage || "Order created successfully",
    data: orderResponse,
    requiresPayment: paymentMethod === "visa",
  });

});


// =============================
// 📋 GET USER ORDERS
// =============================
exports.getUserOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id })
    .populate("user", "firstName lastName email phone")
    .sort({ createdAt: -1 });
  res.status(200).json({ results: orders.length, data: orders });
});

// =============================
// 📋 GET ALL ORDERS (Admin)
// =============================
exports.getAllOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find()
    .populate("user", "firstName lastName email phone")
    .populate("cartItems.product", "code title price imageCover")
    .sort({ createdAt: -1 });
  res.status(200).json({ results: orders.length, data: orders });
});

// =============================
// 🧾 GET SINGLE ORDER
// =============================
exports.getOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id)
    .populate("user", "firstName lastName email phone")
    .populate("cartItems.product", "code title price imageCover");

  if (!order) return next(new ApiError("Order not found", 404));
  res.status(200).json({ data: order });
});

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