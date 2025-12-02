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

// Helper function for calculating totals
const calculateOrderTotals = async (cart, couponCode, user, city, shippingTypeId) => {
  let totalPrice = cart.totalPriceAfterDiscount || cart.totalCartPrice;
  let discountValue = 0;
  let shippingPrice = 0;
  let selectedShippingType = null;
  let couponMessage = "";

  // 1. Calculate Shipping
  const shipping = await Shipping.findOne({ city });
  if (shipping && shipping.shippingTypes) {
    selectedShippingType = shipping.shippingTypes.find(t => t.type === shippingTypeId);
    if (selectedShippingType) {
      shippingPrice = selectedShippingType.cost;
    }
  }

  // Check for Free Shipping Offer (already applied in cart)
  if (cart.hasFreeShipping) {
    shippingPrice = 0;
  }

  // 2. Apply Coupon
  if (couponCode) {
    const coupon = await Offer.findOne({
      couponCode: couponCode,
      offerType: 'coupon',
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    if (!coupon) {
      throw new ApiError("Invalid or expired coupon", 400);
    }

    // Check user group
    if (coupon.userGroup === 'newUser') {
        const previousOrders = await Order.countDocuments({ user: user._id });
        if (previousOrders > 0) {
          throw new ApiError("This coupon is for new users only", 400);
        }
    }

    // Check min cart value
    if (coupon.minCartValue && totalPrice < coupon.minCartValue) {
      throw new ApiError(`Coupon requires minimum cart value of ${coupon.minCartValue}`, 400);
    }

    // Calculate discount (Assuming percentage)
    let couponDiscount = (totalPrice * coupon.discountValue) / 100;
    
    if (couponDiscount > totalPrice) couponDiscount = totalPrice;
    
    totalPrice -= couponDiscount;
    discountValue += couponDiscount;
    couponMessage = "Coupon applied successfully";
  }

  const totalOrderPrice = totalPrice + shippingPrice;

  return {
    totalPrice: cart.totalPriceAfterDiscount || cart.totalCartPrice,
    discountValue,
    shippingPrice,
    totalOrderPrice,
    selectedShippingType,
    couponMessage
  };
};

// =============================
// ✅ CREATE ORDER
// =============================
exports.createOrder = asyncHandler(async (req, res, next) => {
  const { cartId, addressId, paymentMethod = "cod", coupon, shippingTypeId = 'standard' } = req.body;

  if (!["cod", "visa"].includes(paymentMethod)) {
    return next(new ApiError("Invalid payment method", 400));
  }

  const cart = await Cart.findById(cartId).populate("cartItems.product");
  if (!cart) return next(new ApiError("Cart not found", 404));

  const address = await Address.findOne({ _id: addressId, user: req.user._id });
  if (!address) return next(new ApiError("Address not found", 404));

  // ✅ التحقق من توفر الشحن للمدينة
  const shipping = await Shipping.findOne({ city: address.city });
  if (!shipping || !shipping.shippingTypes || shipping.shippingTypes.length === 0) {
    return next(new ApiError(
      `عذراً، الشحن غير متوفر حالياً لمدينة "${address.city}" يرجى تحديث عنوانك.`,
      400
    ));
  }

  // ✅ Validate same-day shipping cutoff time
  if (shippingTypeId === 'same_day') {
    const now = new Date();
    const cutoffHour = 12;
    if (now.getHours() >= cutoffHour) {
      return next(new ApiError('الشحن في نفس اليوم غير متاح بعد الساعة 12 ظهراً', 400));
    }
  }

  const totals = await calculateOrderTotals(cart, coupon, req.user, address.city, shippingTypeId);

  // ✅ Calculate estimated delivery date
  let estimatedDelivery = new Date();
  let shippingTypeInfo = {
    type: shippingTypeId,
    name: 'شحن عادي',
    deliveryTime: '2-3 أيام',
    selectedAt: new Date()
  };

  if (totals.selectedShippingType) {
    shippingTypeInfo = {
      type: totals.selectedShippingType.type,
      name: totals.selectedShippingType.name,
      deliveryTime: totals.selectedShippingType.deliveryTime,
      selectedAt: new Date()
    };
    estimatedDelivery.setHours(estimatedDelivery.getHours() + totals.selectedShippingType.deliveryHours);
  } else {
    estimatedDelivery.setHours(estimatedDelivery.getHours() + 48);
  }

  const order = await Order.create({
    user: req.user._id,
    cart: cart._id,
    cartItems: cart.cartItems,
    address,
    paymentMethod,
    subtotal: totals.totalPrice,
    discountValue: totals.discountValue,
    shippingCost: totals.shippingPrice,
    shippingType: shippingTypeInfo,
    estimatedDelivery,
    total: totals.totalOrderPrice,
    coupon,
    paymentDetails: {
      status: paymentMethod === "visa" ? "pending" : "paid",
      initiatedAt: new Date(),
    },
  });

  await order.populate("user", "firstName lastName email phone");
  await order.populate("cartItems.appliedOffer");

  await Cart.findByIdAndDelete(cart._id);

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

  let orderResponse = order.toObject();

  orderResponse.cartItems = orderResponse.cartItems.map(item => ({
    ...item,
    product: item.product._id || item.product
  }));

  if (paymentMethod === "cod") {
    delete orderResponse.paymentDetails;
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
    .populate("cartItems.appliedOffer")
    .sort({ createdAt: -1 });
  
  const formattedOrders = orders.map(order => {
    const orderObj = order.toObject();
    if (orderObj.paymentMethod === 'cod') {
      delete orderObj.paymentDetails;
    }
    return orderObj;
  });
  
  res.status(200).json({ results: formattedOrders.length, data: formattedOrders });
});

// =============================
// 📋 GET ALL ORDERS (Admin)
// =============================
exports.getAllOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find()
    .populate("user", "firstName lastName email phone")
    .populate("cartItems.product", "code title price imageCover")
    .populate("cartItems.appliedOffer")
    .sort({ createdAt: -1 });
  
  const formattedOrders = orders.map(order => {
    const orderObj = order.toObject();
    if (orderObj.paymentMethod === 'cod') {
      delete orderObj.paymentDetails;
    }
    return orderObj;
  });
  
  res.status(200).json({ results: formattedOrders.length, data: formattedOrders });
});

// =============================
// 🧾 GET SINGLE ORDER (With Smart Payment Check)
// =============================
exports.getOrder = asyncHandler(async (req, res, next) => {
  let order = await Order.findById(req.params.id)
    .populate("user", "firstName lastName email phone")
    .populate("cartItems.product", "code title price imageCover")
    .populate("cartItems.appliedOffer");

  if (!order) return next(new ApiError("Order not found", 404));

  // 🧠 Smart Check: لو الأوردر لسه pending وفيه invoiceId، نتأكد من MyFatoorah فوراً
  if (
    order.paymentMethod === 'visa' && 
    order.paymentDetails.status !== 'paid' && 
    order.paymentDetails.invoiceId
  ) {
    try {
      const myFatoorah = require("../utils/myFatoorah");
      const paymentStatus = await myFatoorah.getPaymentStatus(order.paymentDetails.invoiceId, 'InvoiceId');

      if (paymentStatus.success && paymentStatus.status === 'Paid') {
        console.log(`🧠 Smart Check: Order ${order._id} found PAID in MyFatoorah. Updating...`);
        
        // تحديث الأوردر
        order.status = 'confirmed';
        order.paymentDetails.status = 'paid';
        order.paymentDetails.transactionId = paymentStatus.transactionId;
        order.paymentDetails.paymentMethod = paymentStatus.paymentMethod;
        order.paymentDetails.paidAt = new Date();

        // خصم الكميات
        for (const item of order.cartItems) {
          await Product.findByIdAndUpdate(item.product._id, {
            $inc: { quantity: -item.quantity, sold: item.quantity },
          });
        }

        // حذف السلة
        if (order.cart) {
          await Cart.findByIdAndDelete(order.cart);
        }

        await order.save();
        
        // إرسال إشعار (في الخلفية عشان ما نعطلش الرد)
        sendNotification(
          order.user._id,
          'تم الدفع بنجاح ✅',
          `تم تأكيد دفع طلبك رقم ${order._id} بنجاح.`,
          'order'
        ).catch(err => console.error('Notification Error:', err));
      }
    } catch (error) {
      console.error('❌ Smart Check Error:', error.message);
      // نكمل عادي ونرجع الأوردر بحالته الحالية لو حصل خطأ في التحقق
    }
  }
  
  let orderResponse = order.toObject();
  if (orderResponse.paymentMethod === 'cod') {
    delete orderResponse.paymentDetails;
  }
  
  res.status(200).json({ data: orderResponse });
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