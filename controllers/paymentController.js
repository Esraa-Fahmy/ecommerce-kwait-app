// controllers/paymentController.js
const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const Order = require("../models/orderModel");
const myFatoorah = require("../utils/myFatoorah");
const { sendNotification } = require("../utils/sendNotifications");

// 💳 بدء عملية الدفu
// 💳 Get All Payment Methods From MyFatoorah
exports.getPaymentMethods = asyncHandler(async (req, res, next) => {
  const result = await myFatoorah.initiatePayment({
    total: 1, // مجرد رقم تجريبي — MyFatoorah يتطلب value
    user: req.user,
    orderId: "temp",
    cartItems: [],
  });

  if (!result.success) return next(new ApiError(result.message, 400));

  res.status(200).json({
    status: "success",
    paymentMethods: result.paymentMethods.map(m => ({
      id: m.PaymentMethodId,
      name: m.PaymentMethodEn,
      image: m.ImageUrl,
      serviceCharge: m.ServiceCharge
    }))
  });
});



// 💳 بدء عملية الدفع
exports.initiatePayment = asyncHandler(async (req, res, next) => {
  const { orderId } = req.body;

  // جلب الأوردر
  const order = await Order.findById(orderId).populate('user', 'firstName lastName email phone');
  
  if (!order) {
    return next(new ApiError('Order not found', 404));
  }

  // التحقق إن الأوردر تابع للمستخدم الحالي
  if (order.user._id.toString() !== req.user._id.toString()) {
    return next(new ApiError('Unauthorized access to this order', 403));
  }

  // التحقق إن طريقة الدفع visa
  if (order.paymentMethod !== 'visa') {
    return next(new ApiError('This order is not set for visa payment', 400));
  }

  // التحقق إن الأوردر pending
  if (order.status !== 'pending') {
    return next(new ApiError('This order cannot be paid at this stage', 400));
  }

  // بدء الدفع مع MyFatoorah
  const paymentResult = await myFatoorah.initiatePayment({
    orderId: order._id.toString(),
    total: order.total,
    user: order.user,
    cartItems: order.cartItems,
  });

  if (!paymentResult.success) {
    return next(new ApiError(paymentResult.message, 400));
  }

  // حفظ Invoice ID في الأوردر
  order.paymentDetails = {
    invoiceId: paymentResult.invoiceId,
    status: 'pending',
    initiatedAt: new Date(),
  };
  await order.save();

  res.status(200).json({
    status: 'success',
    message: 'Payment initiated successfully',
    data: {
      paymentURL: paymentResult.paymentURL,
      invoiceId: paymentResult.invoiceId,
    },
  });
});

// ✅ Callback من MyFatoorah بعد الدفع (Success)
exports.paymentSuccess = asyncHandler(async (req, res, next) => {
  const { paymentId } = req.query;

  if (!paymentId) {
    return res.redirect(`${process.env.FRONTEND_URL}/payment/failed`);
  }

  // التحقق من حالة الدفع
  const paymentStatus = await myFatoorah.getPaymentStatus(paymentId);

  if (!paymentStatus.success || paymentStatus.status !== 'Paid') {
    return res.redirect(`${process.env.FRONTEND_URL}/payment/failed`);
  }

  // جلب الأوردر من Reference
  const order = await Order.findById(paymentStatus.reference);

  if (!order) {
    return res.redirect(`${process.env.FRONTEND_URL}/payment/failed`);
  }

  // تحديث الأوردر
  order.status = 'confirmed';
  order.paymentDetails = {
    ...order.paymentDetails,
    status: 'paid',
    transactionId: paymentStatus.transactionId,
    paymentMethod: paymentStatus.paymentMethod,
    paidAt: new Date(),
  };
  await order.save();

  // إرسال إشعار للمستخدم
  await sendNotification(
    order.user,
    'تم الدفع بنجاح ✅',
    `تم تأكيد دفع طلبك رقم ${order._id} بنجاح. إجمالي المبلغ: ${order.total} د.ك`,
    'order'
  );

  // ✅ بدلاً من redirect، نرجع response للـ Flutter
  // Flutter هيستقبل الـ response ويعمل navigation
  res.status(200).json({
    status: 'success',
    message: 'Payment completed successfully',
    data: {
      orderId: order._id,
      total: order.total,
      paymentMethod: paymentStatus.paymentMethod,
      transactionId: paymentStatus.transactionId,
    }
  });
});

// ❌ Error Callback
exports.paymentError = asyncHandler(async (req, res, next) => {
  const { paymentId } = req.query;

  if (paymentId) {
    const paymentStatus = await myFatoorah.getPaymentStatus(paymentId);
    
    if (paymentStatus.success && paymentStatus.reference) {
      const order = await Order.findById(paymentStatus.reference);
      
      if (order) {
        order.paymentDetails = {
          ...order.paymentDetails,
          status: 'failed',
          failedAt: new Date(),
        };
        await order.save();

        await sendNotification(
          order.user,
          'فشل الدفع ❌',
          `فشلت عملية دفع طلبك رقم ${order._id}. يرجى المحاولة مرة أخرى.`,
          'order'
        );
      }
    }
  }

  res.status(400).json({
    status: 'error',
    message: 'Payment failed',
    data: null
  });
});

// 🔔 Webhook من MyFatoorah (للتأكد من الدفع)
exports.paymentWebhook = asyncHandler(async (req, res, next) => {
  const signature = req.headers['myfatoorah-signature'];
  const payload = req.body;

  // التحقق من الـ Signature (أمان)
  if (!myFatoorah.verifyWebhookSignature(payload, signature)) {
    console.error('⚠️ Invalid webhook signature');
    return res.status(400).json({ message: 'Invalid signature' });
  }

  const { Data } = payload;
  
  if (!Data) {
    return res.status(400).json({ message: 'Invalid payload' });
  }

  const order = await Order.findById(Data.CustomerReference);

  if (!order) {
    console.error('❌ Order not found for webhook:', Data.CustomerReference);
    return res.status(404).json({ message: 'Order not found' });
  }

  // تحديث حالة الأوردر حسب حالة الدفع
  if (Data.InvoiceStatus === 'Paid') {
    order.status = 'confirmed';
    order.paymentDetails.status = 'paid';
    order.paymentDetails.paidAt = new Date();
    
    await sendNotification(
      order.user,
      'تأكيد الدفع ✅',
      `تم تأكيد دفع طلبك رقم ${order._id} عبر ${Data.InvoiceTransactions[0]?.PaymentGateway}`,
      'order'
    );
  } else if (Data.InvoiceStatus === 'Failed') {
    order.paymentDetails.status = 'failed';
    order.paymentDetails.failedAt = new Date();
  }

  await order.save();

  res.status(200).json({ message: 'Webhook processed successfully' });
});

// 🔄 استرجاع المبلغ (Refund)
exports.refundPayment = asyncHandler(async (req, res, next) => {
  const { orderId, reason } = req.body;

  const order = await Order.findById(orderId);

  if (!order) {
    return next(new ApiError('Order not found', 404));
  }

  // التحقق إن الدفع تم بالفعل
  if (order.paymentDetails?.status !== 'paid') {
    return next(new ApiError('This order has not been paid yet', 400));
  }

  // طلب الاسترجاع من MyFatoorah
  const refundResult = await myFatoorah.refundPayment(
    order.paymentDetails.transactionId,
    order.total,
    reason
  );

  if (!refundResult.success) {
    return next(new ApiError(refundResult.message, 400));
  }

  // تحديث الأوردر
  order.status = 'refunded';
  order.paymentDetails.status = 'refunded';
  order.paymentDetails.refundId = refundResult.refundId;
  order.paymentDetails.refundedAt = new Date();
  await order.save();

  await sendNotification(
    order.user,
    'تم استرجاع المبلغ 💰',
    `تم استرجاع مبلغ ${order.total} د.ك من طلبك رقم ${order._id}`,
    'order'
  );

  res.status(200).json({
    status: 'success',
    message: 'Refund processed successfully',
    data: refundResult,
  });
});