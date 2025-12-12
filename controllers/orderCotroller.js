const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const Order = require("../models/orderModel");
const Cart = require("../models/cartModel");
const Offer = require("../models/offer.model");
const Product = require("../models/product.model");
const Address = require("../models/addressModel");
const Shipping = require("../models/shippingModel");
const { sendNotification } = require("../utils/sendNotifications");
const { kuwaitiDateNow } = require('../utils/dateUtils');

// 🧮 Helper: حساب الإجماليات
const calculateOrderTotals = async (cart, coupon, user, city, shippingTypeId = 'standard') => {
  let discountValue = 0;
  let totalPrice = 0;
  let couponMessage = null;

  // ✅ استخدام priceAfterOffer من السلة
  for (const item of cart.cartItems) {
    const itemPrice = item.priceAfterOffer || item.price || 0;
    totalPrice += itemPrice * item.quantity;
  }

  // ✅ تطبيق كوبون الخصم
  if (coupon) {
    const offer = await Offer.findOne({ couponCode: coupon });
    const now = kuwaitiDateNow();

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
      if (offer.offerType === "coupon" || offer.offerType === "percentage") {
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
  
  let shippingPrice = 0;
  let hasFreeShipping = cart.hasFreeShipping || false;

  // التحقق من عروض الشحن المجاني
  if (!hasFreeShipping && city) {
    const now = kuwaitiDateNow();
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
      if (!freeShippingOffer.minCartValue || totalAfterDiscount >= freeShippingOffer.minCartValue) {
        hasFreeShipping = true;
      }
    }
  }

  // حساب تكلفة الشحن
  let selectedShippingType = null;
  if (!hasFreeShipping && city) {
    const shipping = await Shipping.findOne({ city });
    if (shipping && shipping.shippingTypes && shipping.shippingTypes.length > 0) {
      selectedShippingType = shipping.shippingTypes.find(t => t.type === shippingTypeId && t.isActive);
      if (!selectedShippingType) {
        selectedShippingType = shipping.shippingTypes.find(t => t.type === 'standard' && t.isActive);
      }
      shippingPrice = selectedShippingType ? selectedShippingType.cost : 0;
    } else if (shipping && shipping.cost) {
      shippingPrice = shipping.cost;
    }
  }

  const totalOrderPrice = totalAfterDiscount + shippingPrice;

  return {
    totalPrice,
    discountValue,
    shippingPrice,
    totalOrderPrice,
    couponMessage,
    hasFreeShipping,
    selectedShippingType,
  };
};

// =============================
// 🧾 PREVIEW ORDER
// =============================
exports.previewOrder = asyncHandler(async (req, res, next) => {
  const { cartId, coupon } = req.body;
  const cart = await Cart.findById(cartId).populate("cartItems.product");

  if (!cart) return next(new ApiError("السلة غير موجودة", 404));

  const totals = await calculateOrderTotals(cart, coupon, req.user);

  res.status(200).json({
    status: "success",
    message: "تم حساب معاينة الطلب بنجاح",
    data: {
      products: cart.cartItems,
      ...totals,
    },
  });
});

// =============================
// ✅ CREATE ORDER
// =============================
exports.createOrder = asyncHandler(async (req, res, next) => {
  const { cartId, addressId, paymentMethod = "cod", coupon, shippingTypeId = 'standard' } = req.body;

  if (!["cod", "knet"].includes(paymentMethod)) {
    return next(new ApiError("طريقة الدفع غير صالحة", 400));
  }

  const cart = await Cart.findById(cartId).populate("cartItems.product");
  if (!cart) return next(new ApiError("السلة غير موجودة", 404));

  const address = await Address.findOne({ _id: addressId, user: req.user._id });
  if (!address) return next(new ApiError("العنوان غير موجود", 404));

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
    const now = kuwaitiDateNow();
    const cutoffHour = 12;
    if (now.getHours() >= cutoffHour) {
      return next(new ApiError('الشحن في نفس اليوم غير متاح بعد الساعة 12 ظهراً', 400));
    }
  }

  const totals = await calculateOrderTotals(cart, coupon, req.user, address.city, shippingTypeId);

  // ✅ Calculate estimated delivery date
  let estimatedDelivery = kuwaitiDateNow();
  let shippingTypeInfo = {
    type: shippingTypeId,
    name: 'شحن عادي',
    deliveryTime: '2-3 أيام',
    selectedAt: kuwaitiDateNow()
  };

  if (totals.selectedShippingType) {
    shippingTypeInfo = {
      type: totals.selectedShippingType.type,
      name: totals.selectedShippingType.name,
      deliveryTime: totals.selectedShippingType.deliveryTime,
      selectedAt: kuwaitiDateNow()
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
      status: paymentMethod === "knet" ? "pending" : "paid",
      initiatedAt: kuwaitiDateNow(),
    },
  });

  await order.populate("user", "firstName lastName email phone");
  await order.populate("cartItems.appliedOffer");

  await Cart.findByIdAndDelete(cart._id);

  if (paymentMethod === "cod") {
    for (const item of order.cartItems) {
      const updatedProduct = await Product.findByIdAndUpdate(item.product._id, {
        $inc: { quantity: -item.quantity, sold: item.quantity },
      }, { new: true });

      if (updatedProduct && updatedProduct.quantity <= 0) {
        await Product.findByIdAndDelete(updatedProduct._id);
      }
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
    message: paymentMethod === "knet" ? "تم إنشاء الطلب. يرجى إتمام الدفع." : totals.couponMessage || "تم إنشاء الطلب بنجاح",
    data: orderResponse,
    requiresPayment: paymentMethod === "knet",
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
  
  // 🧠 Batch Smart Check for Pending Orders
  await Promise.all(orders.map(order => checkAndUpdatePaymentStatus(order)));

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
  
  // 🧠 Batch Smart Check for Pending Orders
  await Promise.all(orders.map(order => checkAndUpdatePaymentStatus(order)));

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

  if (!order) return next(new ApiError("الطلب غير موجود", 404));

  // 🧠 Smart Check
  await checkAndUpdatePaymentStatus(order);
  
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
  if (!order) return next(new ApiError("الطلب غير موجود", 404));

  if (["cancelled_by_user", "cancelled_by_admin"].includes(order.status)) {
    return next(new ApiError("لا يمكن تحديث طلب ملغي", 400));
  }

  order.status = status;
  await order.save();

  const { sendNotification } = require("../utils/sendNotifications");
  await sendNotification(
    order.user._id,
    "تم تحديث حالة الطلب",
    `تم تغيير حالة طلبك رقم ${order._id} إلى "${order.status}".`,
    "order"
  );

  res.status(200).json({ message: "تم تحديث حالة الطلب", data: order });
});

// =============================
// ❌ CANCEL ORDER (User)
// =============================
exports.cancelOrder = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const order = await Order.findOne({ _id: id, user: req.user._id });
  if (!order) return next(new ApiError("الطلب غير موجود", 404));

  if (order.status !== "pending") {
    return next(new ApiError("يمكنك فقط إلغاء الطلبات المعلقة", 400));
  }

  order.status = "cancelled_by_user";
  await order.save();

  const { sendNotification } = require("../utils/sendNotifications");
  await sendNotification(
    req.user._id,
    "تم إلغاء الطلب",
    `لقد تم إلغاء طلبك رقم ${order._id} بنجاح.`,
    "order"
  );

  res.status(200).json({ message: "تم إلغاء الطلب بنجاح", data: order });
});

// =============================
// 🧠 HELPER: Smart Payment Check Logic
// =============================
async function checkAndUpdatePaymentStatus(order) {
  // شروط التحقق: knet, مش مدفوع, وفيه invoiceId
  if (
    order.paymentMethod === 'knet' && 
    order.paymentDetails.status !== 'paid' && 
    order.paymentDetails.invoiceId
  ) {
    try {
      const myFatoorah = require("../utils/myFatoorah");
      const paymentStatus = await myFatoorah.getPaymentStatus(order.paymentDetails.invoiceId, 'InvoiceId');

      if (!paymentStatus.success) return;

      if (paymentStatus.status === 'Paid') {
        console.log(`🧠 Smart Check: Order ${order._id} found PAID in MyFatoorah. Updating...`);
        
        order.status = 'confirmed';
        order.paymentDetails.status = 'paid';
        order.paymentDetails.transactionId = paymentStatus.transactionId;
        order.paymentDetails.paymentMethod = paymentStatus.paymentMethod;
        order.paymentDetails.paidAt = kuwaitiDateNow();

        // خصم الكميات
        for (const item of order.cartItems) {
           const productId = item.product._id || item.product;
           const updatedProduct = await Product.findByIdAndUpdate(productId, {
            $inc: { quantity: -item.quantity, sold: item.quantity },
          }, { new: true });

          if (updatedProduct && updatedProduct.quantity <= 0) {
            await Product.findByIdAndDelete(updatedProduct._id);
          }
        }

        if (order.cart) {
          await Cart.findByIdAndDelete(order.cart);
        }

        await order.save();
        
        const { sendNotification } = require("../utils/sendNotifications");
        sendNotification(
          order.user._id || order.user, 
          'تم الدفع بنجاح ✅',
          `تم تأكيد دفع طلبك رقم ${order._id} بنجاح.`,
          'order'
        ).catch(err => console.error('Notification Error:', err));

      } else if (paymentStatus.status === 'Failed' || paymentStatus.status === 'Cancelled') {
        console.log(`🧠 Smart Check: Order ${order._id} found FAILED in MyFatoorah. Updating...`);
        
        order.status = 'failed';
        order.paymentDetails.status = 'failed';
        order.paymentDetails.failedAt = kuwaitiDateNow();
        await order.save();
        
        const { sendNotification } = require("../utils/sendNotifications");
        sendNotification(
          order.user._id || order.user,
          'فشل الدفع ❌',
          `فشلت عملية دفع طلبك رقم ${order._id}.`,
          'order'
        ).catch(err => console.error('Notification Error:', err));
      }
    } catch (error) {
      console.error(`❌ Smart Check Error for ${order._id}:`, error.message);
    }
  }
}