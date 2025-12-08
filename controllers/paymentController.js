// controllers/paymentController.js
const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const Order = require("../models/orderModel");
const Cart = require("../models/cartModel");
const Product = require("../models/product.model");
const myFatoorah = require("../utils/myFatoorah");
const { sendNotification } = require("../utils/sendNotifications");

// 🛠️ Helper: Send HTML Redirect
const sendHtmlRedirect = (res, deepLink, type = 'success', message = '') => {
  const isSuccess = type === 'success';
  const color = isSuccess ? '#4CAF50' : '#f44336';
  const title = isSuccess ? '✅ Payment Successful' : '❌ Payment Failed';
  const text = isSuccess 
    ? 'Your payment has been processed successfully. Redirecting you back to the app...' 
    : (message || 'Payment failed. Please try again.');
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>${isSuccess ? 'Payment Successful' : 'Payment Failed'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; padding: 40px 20px; background-color: #f9f9f9; }
            .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: ${color}; margin-bottom: 10px; }
            p { color: #666; margin-bottom: 30px; }
            .btn { display: inline-block; padding: 12px 24px; background-color: ${color}; color: white; text-decoration: none; border-radius: 25px; font-weight: bold; transition: background 0.3s; }
            .btn:hover { opacity: 0.9; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>${title}</h1>
            <p>${text}</p>
            <a href="${deepLink}" class="btn">Return to App</a>
        </div>
        <script>
            setTimeout(function() {
                window.location.href = "${deepLink}";
            }, 500);
        </script>
    </body>
    </html>
  `;
  return res.send(html);
};

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

// ✅ التحقق من حالة الدفع باستخدام InvoiceId (للـ Flutter app)
exports.checkPaymentStatus = asyncHandler(async (req, res, next) => {
  const { invoiceId } = req.params;

  if (!invoiceId) {
    return next(new ApiError('Invoice ID is required', 400));
  }

  // البحث عن الأوردر باستخدام invoiceId
  const order = await Order.findOne({ 
    'paymentDetails.invoiceId': invoiceId 
  });

  if (!order) {
    return next(new ApiError('Order not found', 404));
  }

  // التحقق من ملكية الأوردر
  if (order.user.toString() !== req.user._id.toString()) {
    return next(new ApiError('Unauthorized', 403));
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
    // تحديث الأوردر
    order.status = 'confirmed';
    order.paymentDetails.status = 'paid';
    order.paymentDetails.transactionId = paymentStatus.transactionId;
    order.paymentDetails.paymentMethod = paymentStatus.paymentMethod;
    order.paymentDetails.paidAt = new Date();
    
    // خصم الكميات (فقط لو الدفع لم يتم من قبل)
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
      `تم تأكيد دفع طلبك رقم ${order._id}`,
      'order'
    );
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

// ✅ Callback - Success (App Links)
exports.paymentSuccess = asyncHandler(async (req, res, next) => {
  const { paymentId } = req.query;

  console.log('🔔 Payment Success Callback - Start', { paymentId });

  if (!paymentId) {
    console.error('❌ Payment Success Callback - Missing paymentId');
    return res.redirect(`/payment-error?message=${encodeURIComponent('Payment ID is required')}`);
  }

  try {
    // ✅ Step 1: التحقق من حالة الدفع من MyFatoorah
    console.log('📡 Fetching payment status from MyFatoorah...');
    const paymentStatus = await myFatoorah.getPaymentStatus(paymentId, 'PaymentId');

    if (!paymentStatus.success || paymentStatus.status !== 'Paid') {
      console.error('❌ Payment not completed', { paymentStatus });
      return res.redirect(`/payment-error?message=${encodeURIComponent('Payment not completed')}`);
    }

    console.log('✅ Payment verified as Paid', { 
      transactionId: paymentStatus.transactionId,
      orderId: paymentStatus.reference 
    });

    // ✅ Step 2: البحث عن الطلب
    console.log('🔍 Finding order...', { orderId: paymentStatus.reference });
    const order = await Order.findById(paymentStatus.reference)
      .populate('cart')
      .populate('user', 'firstName lastName email phone');

    if (!order) {
      console.error('❌ Order not found', { orderId: paymentStatus.reference });
      return res.redirect(`/payment-error?message=${encodeURIComponent('Order not found')}`);
    }

    console.log('✅ Order found', { 
      orderId: order._id, 
      currentStatus: order.status,
      paymentStatus: order.paymentDetails?.status 
    });

    // ✅ Step 3: معالجة الطلب في الـ background
    // استخدام setImmediate لتنفيذ الكود بشكل غير متزامن
    setImmediate(async () => {
      try {
        if (order.paymentDetails.status !== 'paid') {
          console.log('🔄 Processing payment confirmation in background...');

          // تحديث حالة الطلب
          order.status = 'confirmed';
          order.paymentDetails.status = 'paid';
          order.paymentDetails.transactionId = paymentStatus.transactionId;
          order.paymentDetails.paymentMethod = paymentStatus.paymentMethod;
          order.paymentDetails.paidAt = new Date();
          
          console.log('✅ Order status updated to confirmed');

          // ✅ خصم الكميات من المنتجات
          console.log('📦 Deducting inventory...');
          for (const item of order.cartItems) {
            try {
              await Product.findByIdAndUpdate(item.product, {
                $inc: { quantity: -item.quantity, sold: item.quantity },
              });
              console.log(`✅ Inventory updated for product ${item.product}`, {
                quantity: item.quantity
              });
            } catch (error) {
              console.error(`❌ Failed to update inventory for product ${item.product}`, error);
            }
          }

          // ✅ حذف الـ Cart
          if (order.cart) {
            try {
              console.log('🗑️ Deleting cart...', { cartId: order.cart._id || order.cart });
              await Cart.findByIdAndDelete(order.cart._id || order.cart);
              console.log('✅ Cart deleted successfully');
            } catch (error) {
              console.error('❌ Failed to delete cart', error);
            }
          }

          // ✅ حفظ التغييرات
          console.log('💾 Saving order...');
          await order.save();
          console.log('✅ Order saved successfully');

          // ✅ إرسال الإشعار
          try {
            const { sendNotification } = require("../utils/sendNotifications");
            console.log('🔔 Sending notification...');
            await sendNotification(
              order.user._id,
              'تم الدفع بنجاح ✅',
              `تم تأكيد دفع طلبك رقم ${order._id} بنجاح. إجمالي المبلغ: ${order.total} د.ك`,
              'order'
            );
            console.log('✅ Notification sent successfully');
          } catch (error) {
            console.error('❌ Failed to send notification', error);
          }

          console.log('🎉 Background payment processing completed successfully!');
        } else {
          console.log('ℹ️ Order already marked as paid, skipping background processing');
        }
      } catch (bgError) {
        console.error('❌ Background processing error:', bgError);
      }
    });

    // ✅ Step 4: انتظار قصير (2 ثانية) لضمان بدء المعالجة قبل فتح التطبيق
    console.log('⏳ Waiting 2 seconds before sending response...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // ✅ Step 5: إرسال HTML Response
    const html = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Successful</title>
          <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
              .container { background: white; padding: 40px; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-width: 400px; }
              h1 { color: #4CAF50; margin-bottom: 20px; }
              p { color: #666; margin-bottom: 30px; }
              .icon { font-size: 80px; margin-bottom: 20px; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="icon">✅</div>
              <h1>تم الدفع بنجاح!</h1>
              <p>تمت معالجة الدفع بنجاح. سيتم فتح التطبيق تلقائياً...</p>
              <p style="font-size: 12px; color: #999;">Order ID: ${order._id}</p>
          </div>
      </body>
      </html>
    `;
    
    console.log('📄 Sending HTML response...');
    res.send(html);


  } catch (error) {
    console.error('❌ Payment Success Callback - Unexpected Error:', error);
    return res.redirect(`/payment-error?message=${encodeURIComponent('An error occurred processing your payment')}`);
  }
});

// ❌ Error Callback (App Links)
exports.paymentError = asyncHandler(async (req, res, next) => {
  const { paymentId, message, orderId } = req.query;
  let errorMessage = message || 'Payment failed';

  if (paymentId) {
    const paymentStatus = await myFatoorah.getPaymentStatus(paymentId, 'PaymentId');
    
    if (paymentStatus.success && paymentStatus.reference) {
      const order = await Order.findById(paymentStatus.reference);
      
      if (order) {
        // ✅ تحديث حالة الطلب والدفع (فقط لو الدفع فعلاً فشل)
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
          // ✅ لو الدفع نجح بس اترجع على error بالغلط، نوجهه للـ success
          return res.redirect(`/payment-success?paymentId=${paymentId}`);
        }
      }
    }
  } else if (orderId) {
    // ✅ حالة إلغاء الدفع بدون paymentId (المستخدم رجع من صفحة الدفع)
    const order = await Order.findById(orderId);
    
    if (order && order.paymentDetails?.status === 'pending') {
      order.status = 'failed';
      order.paymentDetails.status = 'failed';
      order.paymentDetails.failedAt = new Date();
      await order.save();

      await sendNotification(
        order.user,
        'تم إلغاء الدفع ❌',
        `تم إلغاء عملية دفع طلبك رقم ${order._id}.`,
        'order'
      );
    }
  }

  // ✅ Render simple page for App Links (Android will intercept this URL)
  const html = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Failed</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
            .container { background: white; padding: 40px; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-width: 400px; }
            h1 { color: #f44336; margin-bottom: 20px; }
            p { color: #666; margin-bottom: 30px; }
            .icon { font-size: 80px; margin-bottom: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="icon">❌</div>
            <h1>فشل الدفع</h1>
            <p>${errorMessage}</p>
            <p style="font-size: 14px; color: #999;">يرجى المحاولة مرة أخرى</p>
        </div>
    </body>
    </html>
  `;
  
  return res.send(html);
});

// 🔔 Webhook (Primary Payment Confirmation Mechanism)
exports.paymentWebhook = asyncHandler(async (req, res, next) => {
  console.log('🔔 Webhook Received - Start');
  
  const signature = req.headers['myfatoorah-signature'];
  const payload = req.body;

  console.log('📦 Webhook Payload:', JSON.stringify(payload, null, 2));

  // ✅ السماح بتخطي التحقق في بيئة التطوير فقط (للاختبار من Postman)
  const skipSignatureCheck = process.env.SKIP_WEBHOOK_SIGNATURE_CHECK === 'true';
  
  if (!skipSignatureCheck && !myFatoorah.verifyWebhookSignature(payload, signature)) {
    console.error('⚠️ Invalid webhook signature');
    return res.status(400).json({ message: 'Invalid signature' });
  }

  if (skipSignatureCheck) {
    console.warn('⚠️ WARNING: Webhook signature check is DISABLED for testing');
  }

  const { Data } = payload;
  
  if (!Data) {
    console.error('❌ Webhook - Invalid payload: No Data field');
    return res.status(400).json({ message: 'Invalid payload' });
  }

  console.log('📋 Webhook Data:', {
    InvoiceStatus: Data.InvoiceStatus,
    CustomerReference: Data.CustomerReference,
    InvoiceId: Data.InvoiceId,
    TransactionId: Data.InvoiceTransactions?.[0]?.TransactionId
  });

  const order = await Order.findById(Data.CustomerReference)
    .populate('cart')
    .populate('user', 'firstName lastName email phone fcmToken');

  if (!order) {
    console.error('❌ Webhook - Order not found:', Data.CustomerReference);
    return res.status(404).json({ message: 'Order not found' });
  }

  console.log('✅ Webhook - Order found:', {
    orderId: order._id,
    currentStatus: order.status,
    paymentStatus: order.paymentDetails?.status
  });

  if (Data.InvoiceStatus === 'Paid' && order.paymentDetails.status !== 'paid') {
    console.log('🔄 Webhook - Processing payment confirmation...');

    // ✅ تحديث Order (فقط لو لم يتم الدفع من قبل)
    order.status = 'confirmed';
    order.paymentDetails.status = 'paid';
    order.paymentDetails.transactionId = Data.InvoiceTransactions?.[0]?.TransactionId;
    order.paymentDetails.paymentMethod = Data.InvoiceTransactions?.[0]?.PaymentGateway;
    order.paymentDetails.paidAt = new Date();
    
    console.log('✅ Webhook - Order status updated to confirmed');

    // ✅ خصم الكميات
    console.log('📦 Webhook - Deducting inventory...');
    for (const item of order.cartItems) {
      try {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { quantity: -item.quantity, sold: item.quantity },
        });
        console.log(`✅ Webhook - Inventory updated for product ${item.product}`);
      } catch (error) {
        console.error(`❌ Webhook - Failed to update inventory for product ${item.product}`, error);
      }
    }

    // ✅ حذف الـ Cart
    if (order.cart) {
      try {
        console.log('🗑️ Webhook - Deleting cart...', { cartId: order.cart._id || order.cart });
        await Cart.findByIdAndDelete(order.cart._id || order.cart);
        console.log('✅ Webhook - Cart deleted successfully');
      } catch (error) {
        console.error('❌ Webhook - Failed to delete cart', error);
      }
    }

    // ✅ حفظ التغييرات
    console.log('💾 Webhook - Saving order...');
    await order.save();
    console.log('✅ Webhook - Order saved successfully');
    
    // ✅ إرسال الإشعار
    try {
      console.log('🔔 Webhook - Sending notification...');
      await sendNotification(
        order.user._id,
        'تأكيد الدفع ✅',
        `تم تأكيد دفع طلبك رقم ${order._id} عبر ${Data.InvoiceTransactions[0]?.PaymentGateway}`,
        'order'
      );
      console.log('✅ Webhook - Notification sent successfully');
    } catch (error) {
      console.error('❌ Webhook - Failed to send notification', error);
    }

    console.log('🎉 Webhook - Payment processing completed successfully!');
  } else if (Data.InvoiceStatus === 'Paid' && order.paymentDetails.status === 'paid') {
    console.log('ℹ️ Webhook - Order already marked as paid, skipping processing');
  } else if (Data.InvoiceStatus === 'Failed') {
    console.log('⚠️ Webhook - Payment failed, updating order status');
    order.paymentDetails.status = 'failed';
    order.paymentDetails.failedAt = new Date();
    await order.save();
    console.log('✅ Webhook - Order marked as failed');
  } else {
    console.log(`ℹ️ Webhook - Invoice status: ${Data.InvoiceStatus}, no action taken`);
  }

  console.log('✅ Webhook - Complete');
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
