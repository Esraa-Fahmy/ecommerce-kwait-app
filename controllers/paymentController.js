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

  const paymentResult = await myFatoorah.executePayment(
    paymentMethodId,
    {
      orderId: order._id.toString(),
      total: order.total,
      shippingCost: order.shippingCost || 0,
      discountValue: order.discountValue || 0,
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

// ✅ التحقق من حالة الدفع (للـ Flutter app - Polling)
exports.checkPaymentStatus = asyncHandler(async (req, res, next) => {
  const { invoiceId } = req.params;

  if (!invoiceId) {
    return next(new ApiError('Invoice ID is required', 400));
  }

  const order = await Order.findOne({ 
    'paymentDetails.invoiceId': invoiceId 
  });

  if (!order) {
    return next(new ApiError('Order not found', 404));
  }

  if (order.user.toString() !== req.user._id.toString()) {
    return next(new ApiError('Unauthorized', 403));
  }

  // ✅ إذا كان الأوردر مدفوع، نرجع الحالة مباشرة
  if (order.paymentDetails.status === 'paid') {
    return res.status(200).json({
      status: 'success',
      data: {
        orderId: order._id,
        orderStatus: order.status,
        paymentStatus: 'paid',
        transactionId: order.paymentDetails.transactionId,
        total: order.total,
        isPaid: true,
        isFailed: false
      }
    });
  }

  // ✅ استدعاء MyFatoorah للحصول على آخر حالة
  const paymentStatus = await myFatoorah.getPaymentStatus(invoiceId, 'InvoiceId');

  if (!paymentStatus.success) {
    return res.status(200).json({
      status: 'pending',
      message: 'Payment is still pending',
      orderStatus: order.status,
      paymentStatus: order.paymentDetails?.status || 'pending'
    });
  }

  // ✅ لو الدفع نجح ولسه مش محدّث
  if (paymentStatus.status === 'Paid' && order.paymentDetails.status !== 'paid') {
    // معالجة الدفع (نفس اللي في الـ webhook)
    await processSuccessfulPayment(order, paymentStatus);
  }

  // ✅ لو الدفع فشل
  if (paymentStatus.status === 'Failed' && order.paymentDetails.status !== 'failed') {
    order.paymentDetails.status = 'failed';
    order.paymentDetails.failedAt = new Date();
    await order.save();

    await sendNotification(
      order.user,
      'فشل الدفع ❌',
      `فشلت عملية دفع طلبك رقم ${order._id}`,
      'order'
    );
  }

  // إرجاع الحالة الحالية
  res.status(200).json({
    status: 'success',
    data: {
      orderId: order._id,
      orderStatus: order.status,
      paymentStatus: order.paymentDetails.status,
      transactionId: order.paymentDetails.transactionId,
      total: order.total,
      isPaid: order.paymentDetails.status === 'paid',
      isFailed: order.paymentDetails.status === 'failed'
    }
  });
});

// ✅ Success Callback - SIMPLIFIED (لا تنتظر، فقط redirect فوراً)
exports.paymentSuccess = asyncHandler(async (req, res, next) => {
  const { paymentId } = req.query;

  console.log('🔔 Payment Success Callback', { paymentId });

  if (!paymentId) {
    console.error('❌ Missing paymentId');
    return res.redirect(`/payment-failed?message=${encodeURIComponent('Payment ID is required')}`);
  }

  // ✅ رد HTML فوراً بدون انتظار
  const html = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Successful</title>
        <style>
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              text-align: center; 
              padding: 50px 20px; 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh; 
              display: flex; 
              align-items: center; 
              justify-content: center;
              margin: 0;
            }
            .container { 
              background: white; 
              padding: 40px; 
              border-radius: 20px; 
              box-shadow: 0 20px 60px rgba(0,0,0,0.3); 
              max-width: 400px;
              width: 100%;
            }
            h1 { color: #4CAF50; margin-bottom: 20px; font-size: 28px; }
            p { color: #666; margin-bottom: 20px; line-height: 1.6; }
            .icon { font-size: 80px; margin-bottom: 20px; animation: scaleIn 0.5s ease-out; }
            @keyframes scaleIn {
              from { transform: scale(0); }
              to { transform: scale(1); }
            }
            .spinner {
              width: 40px;
              height: 40px;
              margin: 20px auto;
              border: 4px solid #f3f3f3;
              border-top: 4px solid #4CAF50;
              border-radius: 50%;
              animation: spin 1s linear infinite;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="icon">✅</div>
            <h1>تم الدفع بنجاح!</h1>
            <p>تمت معالجة الدفع بنجاح. جاري تحويلك إلى التطبيق...</p>
            <div class="spinner"></div>
            <p style="font-size: 12px; color: #999;">Payment ID: ${paymentId}</p>
        </div>
        <script>
          // Redirect to app immediately
          setTimeout(function() {
            window.location.href = '3roudapp://payment-success?paymentId=${paymentId}';
          }, 500);
        </script>
    </body>
    </html>
  `;
  
  console.log('📄 Sending HTML response');
  res.send(html);

  // ✅ معالجة الدفع في الخلفية (بدون blocking)
  setImmediate(async () => {
    try {
      console.log('🔄 Background processing started');
      const paymentStatus = await myFatoorah.getPaymentStatus(paymentId, 'PaymentId');

      if (paymentStatus.success && paymentStatus.status === 'Paid') {
        const order = await Order.findById(paymentStatus.reference)
          .populate('cart')
          .populate('user', 'firstName lastName email phone');

        if (order && order.paymentDetails.status !== 'paid') {
          await processSuccessfulPayment(order, paymentStatus);
          console.log('✅ Background processing completed');
        }
      }
    } catch (error) {
      console.error('❌ Background processing error:', error);
    }
  });
});

// ❌ Error Callback
exports.paymentError = asyncHandler(async (req, res, next) => {
  const { paymentId, message } = req.query;
  let errorMessage = message || 'Payment failed';

  console.log('❌ Payment Error Callback', { paymentId, message });

  if (paymentId) {
    const paymentStatus = await myFatoorah.getPaymentStatus(paymentId, 'PaymentId');
    
    if (paymentStatus.success && paymentStatus.reference) {
      const order = await Order.findById(paymentStatus.reference);
      
      if (order) {
        if (paymentStatus.status === 'Failed' || paymentStatus.status === 'Cancelled') {
          order.status = 'failed';
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
        } else if (paymentStatus.status === 'Paid') {
          return res.redirect(`/payment-success?paymentId=${paymentId}`);
        }
      }
    }
  }

  const html = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Failed</title>
        <style>
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              text-align: center; 
              padding: 50px 20px;
              background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0;
            }
            .container { 
              background: white;
              padding: 40px;
              border-radius: 20px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              max-width: 400px;
              width: 100%;
            }
            h1 { color: #f44336; margin-bottom: 20px; font-size: 28px; }
            p { color: #666; margin-bottom: 20px; line-height: 1.6; }
            .icon { font-size: 80px; margin-bottom: 20px; animation: scaleIn 0.5s ease-out; }
            @keyframes scaleIn {
              from { transform: scale(0); }
              to { transform: scale(1); }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="icon">❌</div>
            <h1>فشل الدفع</h1>
            <p>${errorMessage}</p>
            <p style="font-size: 14px; color: #999;">يرجى المحاولة مرة أخرى</p>
        </div>
        <script>
          setTimeout(function() {
            window.location.href = '3roudapp://payment-error?paymentId=${paymentId || ''}&message=${encodeURIComponent(errorMessage)}';
          }, 500);
        </script>
    </body>
    </html>
  `;
  
  return res.send(html);
});

// 🔔 Webhook - PRIMARY MECHANISM
exports.paymentWebhook = asyncHandler(async (req, res, next) => {
  console.log('🔔 Webhook Received');
  
  const signature = req.headers['myfatoorah-signature'];
  const payload = req.body;

  console.log('📦 Webhook Payload:', JSON.stringify(payload, null, 2));

  const skipSignatureCheck = process.env.SKIP_WEBHOOK_SIGNATURE_CHECK === 'true';
  
  if (!skipSignatureCheck && !myFatoorah.verifyWebhookSignature(payload, signature)) {
    console.error('⚠️ Invalid webhook signature');
    return res.status(400).json({ message: 'Invalid signature' });
  }

  if (skipSignatureCheck) {
    console.warn('⚠️ Webhook signature check DISABLED');
  }

  const { Data } = payload;
  
  if (!Data) {
    console.error('❌ Invalid payload: No Data field');
    return res.status(400).json({ message: 'Invalid payload' });
  }

  const order = await Order.findById(Data.CustomerReference)
    .populate('cart')
    .populate('user', 'firstName lastName email phone');

  if (!order) {
    console.error('❌ Order not found:', Data.CustomerReference);
    return res.status(404).json({ message: 'Order not found' });
  }

  console.log('✅ Order found:', {
    orderId: order._id,
    currentStatus: order.status,
    paymentStatus: order.paymentDetails?.status
  });

  if (Data.InvoiceStatus === 'Paid' && order.paymentDetails.status !== 'paid') {
    await processSuccessfulPayment(order, {
      transactionId: Data.InvoiceTransactions?.[0]?.TransactionId,
      paymentMethod: Data.InvoiceTransactions?.[0]?.PaymentGateway,
      status: 'Paid'
    });
  } else if (Data.InvoiceStatus === 'Failed') {
    console.log('⚠️ Payment failed');
    order.paymentDetails.status = 'failed';
    order.paymentDetails.failedAt = new Date();
    await order.save();
  }

  console.log('✅ Webhook Complete');
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

// =============================
// 🛠️ HELPER FUNCTION
// =============================
async function processSuccessfulPayment(order, paymentStatus) {
  console.log('🔄 Processing successful payment for order:', order._id);

  // تحديث Order
  order.status = 'confirmed';
  order.paymentDetails.status = 'paid';
  order.paymentDetails.transactionId = paymentStatus.transactionId;
  order.paymentDetails.paymentMethod = paymentStatus.paymentMethod;
  order.paymentDetails.paidAt = new Date();
  
  // خصم الكميات
  for (const item of order.cartItems) {
    try {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { quantity: -item.quantity, sold: item.quantity },
      });
      console.log(`✅ Inventory updated for product ${item.product}`);
    } catch (error) {
      console.error(`❌ Failed to update inventory for ${item.product}`, error);
    }
  }

  // حذف الـ Cart
  if (order.cart) {
    try {
      await Cart.findByIdAndDelete(order.cart._id || order.cart);
      console.log('✅ Cart deleted');
    } catch (error) {
      console.error('❌ Failed to delete cart', error);
    }
  }

  await order.save();
  console.log('✅ Order saved');
  
  // إرسال الإشعار
  try {
    await sendNotification(
      order.user._id,
      'تم الدفع بنجاح ✅',
      `تم تأكيد دفع طلبك رقم ${order._id} بنجاح. إجمالي المبلغ: ${order.total} د.ك`,
      'order'
    );
    console.log('✅ Notification sent');
  } catch (error) {
    console.error('❌ Failed to send notification', error);
  }

  console.log('🎉 Payment processing completed');
}