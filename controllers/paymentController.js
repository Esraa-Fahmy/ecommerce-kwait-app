// controllers/paymentController.js
const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const Order = require("../models/orderModel");
const Cart = require("../models/cartModel");
const Product = require("../models/product.model");
const myFatoorah = require("../utils/myFatoorah");
const { sendNotification } = require("../utils/sendNotifications");

// 💳 Get All Payment Methods From MyFatoorah
exports.getPaymentMethods = asyncHandler(async (req, res, next) => {
  const result = await myFatoorah.initiatePayment({
    total: 1,
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
  const { orderId, paymentMethodId } = req.body;

  if (!paymentMethodId) {
    return next(new ApiError('Payment method is required', 400));
  }

  const order = await Order.findById(orderId).populate('user', 'firstName lastName email phone');
  
  if (!order) {
    return next(new ApiError('Order not found', 404));
  }

  if (order.user._id.toString() !== req.user._id.toString()) {
    return next(new ApiError('Unauthorized access to this order', 403));
  }

  if (order.paymentMethod !== 'visa') {
    return next(new ApiError('This order is not set for visa payment', 400));
  }

  if (order.status !== 'pending') {
    return next(new ApiError('This order cannot be paid at this stage', 400));
  }

  // ✅ بدء الدفع مع تمرير بيانات الشحن والخصم
  const paymentResult = await myFatoorah.executePayment(
    paymentMethodId,
    {
      orderId: order._id.toString(),
      total: order.total,
      shippingCost: order.shippingCost || 0,      // ✅ الشحن
      discountValue: order.discountValue || 0,    // ✅ الخصم
      user: {
        firstName: order.user.firstName,
        lastName: order.user.lastName,
        email: order.user.email,
        phone: order.user.phone,
        _id: order.user._id
      },
      cartItems: order.cartItems,
    }
  );

  if (!paymentResult.success) {
    return next(new ApiError(paymentResult.message, 400));
  }

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

// ✅ Callback - Success (محدّث)
exports.paymentSuccess = asyncHandler(async (req, res, next) => {
  const { paymentId } = req.query;

  if (!paymentId) {
    return res.status(400).json({
      status: 'error',
      message: 'Payment ID is required'
    });
  }

  const paymentStatus = await myFatoorah.getPaymentStatus(paymentId);

  if (!paymentStatus.success || paymentStatus.status !== 'Paid') {
    return res.status(400).json({
      status: 'error',
      message: 'Payment not completed'
    });
  }

  const order = await Order.findById(paymentStatus.reference).populate('cart');

  if (!order) {
    return res.status(404).json({
      status: 'error',
      message: 'Order not found'
    });
  }

  // ✅ تحديث Order + خصم الكميات + حذف Cart
  order.status = 'confirmed';
  order.paymentDetails.status = 'paid';
  order.paymentDetails.transactionId = paymentStatus.transactionId;
  order.paymentDetails.paymentMethod = paymentStatus.paymentMethod;
  order.paymentDetails.paidAt = new Date();
  
  // خصم الكميات
  for (const item of order.cartItems) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { quantity: -item.quantity, sold: item.quantity },
    });
  }

  // حذف الـ Cart
  if (order.cart) {
    await Cart.findByIdAndDelete(order.cart);
  }

  await order.save();

  await sendNotification(
    order.user,
    'تم الدفع بنجاح ✅',
    `تم تأكيد دفع طلبك رقم ${order._id} بنجاح. إجمالي المبلغ: ${order.total} د.ك`,
    'order'
  );

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

// 🔔 Webhook (محدّث)
exports.paymentWebhook = asyncHandler(async (req, res, next) => {
  const signature = req.headers['myfatoorah-signature'];
  const payload = req.body;

  if (!myFatoorah.verifyWebhookSignature(payload, signature)) {
    console.error('⚠️ Invalid webhook signature');
    return res.status(400).json({ message: 'Invalid signature' });
  }

  const { Data } = payload;
  
  if (!Data) {
    return res.status(400).json({ message: 'Invalid payload' });
  }

  const order = await Order.findById(Data.CustomerReference).populate('cart');

  if (!order) {
    console.error('❌ Order not found for webhook:', Data.CustomerReference);
    return res.status(404).json({ message: 'Order not found' });
  }

  if (Data.InvoiceStatus === 'Paid') {
    // ✅ تحديث Order
    order.status = 'confirmed';
    order.paymentDetails.status = 'paid';
    order.paymentDetails.transactionId = Data.InvoiceTransactions?.[0]?.TransactionId;
    order.paymentDetails.paymentMethod = Data.InvoiceTransactions?.[0]?.PaymentGateway;
    order.paymentDetails.paidAt = new Date();
    
    // ✅ خصم الكميات
    for (const item of order.cartItems) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { quantity: -item.quantity, sold: item.quantity },
      });
    }

    // ✅ حذف الـ Cart
    if (order.cart) {
      await Cart.findByIdAndDelete(order.cart);
    }

    await order.save();
    
    await sendNotification(
      order.user,
      'تأكيد الدفع ✅',
      `تم تأكيد دفع طلبك رقم ${order._id} عبر ${Data.InvoiceTransactions[0]?.PaymentGateway}`,
      'order'
    );
  } else if (Data.InvoiceStatus === 'Failed') {
    order.paymentDetails.status = 'failed';
    order.paymentDetails.failedAt = new Date();
    await order.save();
  }

  res.status(200).json({ message: 'Webhook processed successfully' });
});

// 🔄 Refund
exports.refundPayment = asyncHandler(async (req, res, next) => {
  const { orderId, reason } = req.body;

  const order = await Order.findById(orderId);

  if (!order) {
    return next(new ApiError('Order not found', 404));
  }

  if (order.paymentDetails?.status !== 'paid') {
    return next(new ApiError('This order has not been paid yet', 400));
  }

  const refundResult = await myFatoorah.refundPayment(
    order.paymentDetails.transactionId,
    order.total,
    reason
  );

  if (!refundResult.success) {
    return next(new ApiError(refundResult.message, 400));
  }

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