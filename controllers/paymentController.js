// controllers/paymentController.js
const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const Order = require("../models/orderModel");
const Cart = require("../models/cartModel");
const Product = require("../models/product.model");
const myFatoorah = require("../utils/myFatoorah");
const { sendNotification } = require("../utils/sendNotifications");
const { kuwaitiDateNow } = require('../utils/dateUtils');

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
    return next(new ApiError('طريقة الدفع مطلوبة', 400));
  }

  const order = await Order.findById(orderId).populate('user', 'firstName lastName email phone');
  
  if (!order) {
    return next(new ApiError('الطلب غير موجود', 404));
  }

  if (order.user._id.toString() !== req.user._id.toString()) {
    return next(new ApiError('وصول غير مصرح به لهذا الطلب', 403));
  }

  if (order.paymentMethod !== 'knet') {
    return next(new ApiError('هذا الطلب غير مخصص للدفع بالكي نت (KNET)', 400));
  }

  if (order.status !== 'pending') {
    return next(new ApiError('لا يمكن دفع قيمة هذا الطلب في هذه المرحلة', 400));
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
    initiatedAt: kuwaitiDateNow(),
  };
  await order.save();

  res.status(200).json({
    status: 'success',
    message: 'تم بدء عملية الدفع بنجاح',
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
    return next(new ApiError('معرف الفاتورة مطلوب', 400));
  }

  const order = await Order.findOne({ 
    'paymentDetails.invoiceId': invoiceId 
  });

  if (!order) {
    return next(new ApiError('الطلب غير موجود', 404));
  }

  if (order.user.toString() !== req.user._id.toString()) {
    return next(new ApiError('غير مصرح', 403));
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
      message: 'الدفع لا يزال قيد الانتظار',
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
    order.paymentDetails.failedAt = kuwaitiDateNow();
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

// ✅ Success Callback - iOS 26 Style
exports.paymentSuccess = asyncHandler(async (req, res, next) => {
  const { paymentId } = req.query;

  console.log('🔔 Payment Success Callback', { paymentId });

  if (!paymentId) {
    console.error('❌ Missing paymentId');
    return res.redirect(`/payment-failed?message=${encodeURIComponent('معرف الدفع مطلوب')}`);
  }

  const html = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>تم الدفع بنجاح</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800&display=swap" rel="stylesheet">
        <style>
            :root {
                --primary: #34C759;
                --surface: rgba(255, 255, 255, 0.65);
                --surface-dark: rgba(0, 0, 0, 0.05);
                --blur: 25px;
                --text: #000000;
                --text-secondary: #3C3C4399;
            }

            * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

            body {
                font-family: 'Cairo', -apple-system, BlinkMacSystemFont, sans-serif;
                background: #F2F2F7;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                position: relative;
            }

            /* Mesh Gradient Background */
            .mesh-bg {
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                background: 
                    radial-gradient(at 0% 0%, hsla(135,70%,85%,1) 0, transparent 50%),
                    radial-gradient(at 100% 0%, hsla(150,70%,88%,1) 0, transparent 50%),
                    radial-gradient(at 100% 100%, hsla(135,70%,85%,1) 0, transparent 50%),
                    radial-gradient(at 0% 100%, hsla(150,70%,88%,1) 0, transparent 50%);
                filter: blur(60px);
                z-index: -1;
                animation: breathe 10s ease-in-out infinite alternate;
            }

            @keyframes breathe {
                0% { transform: scale(1); opacity: 0.8; }
                100% { transform: scale(1.1); opacity: 1; }
            }

            .card {
                background: var(--surface);
                backdrop-filter: blur(var(--blur));
                -webkit-backdrop-filter: blur(var(--blur));
                border-radius: 32px;
                padding: 48px 32px;
                width: 90%;
                max-width: 400px;
                text-align: center;
                box-shadow: 
                    0 20px 40px rgba(0,0,0,0.05),
                    0 1px 0 rgba(255,255,255,0.5) inset;
                transform: translateY(20px);
                opacity: 0;
                animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                position: relative;
                overflow: hidden;
            }

            @keyframes slideUp {
                to { transform: translateY(0); opacity: 1; }
            }

            .logo {
                width: 80px;
                height: 80px;
                margin: 0 auto 32px;
                filter: drop-shadow(0 4px 12px rgba(0,0,0,0.08));
                animation: float 6s ease-in-out infinite;
            }

            .logo img { width: 100%; height: 100%; object-fit: contain; }

            @keyframes float {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-6px); }
            }

            .icon-wrapper {
                width: 96px;
                height: 96px;
                background: linear-gradient(135deg, #34C759, #30D158);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 24px;
                box-shadow: 
                    0 12px 24px rgba(52, 199, 89, 0.25),
                    0 0 0 8px rgba(52, 199, 89, 0.1);
                animation: scaleIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s backwards;
            }

            @keyframes scaleIn {
                from { transform: scale(0); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }

            .icon-wrapper svg {
                width: 44px;
                height: 44px;
                stroke: white;
                stroke-width: 3.5;
                stroke-linecap: round;
                stroke-linejoin: round;
                fill: none;
                stroke-dasharray: 100;
                stroke-dashoffset: 100;
                animation: draw 0.8s ease-out 0.6s forwards;
            }

            @keyframes draw { to { stroke-dashoffset: 0; } }

            h1 {
                font-size: 28px;
                font-weight: 800;
                color: var(--text);
                margin-bottom: 12px;
                letter-spacing: -0.5px;
            }

            p {
                font-size: 17px;
                color: var(--text-secondary);
                line-height: 1.5;
                margin-bottom: 32px;
                font-weight: 400;
            }

            .details {
                background: rgba(255,255,255,0.5);
                border-radius: 20px;
                padding: 16px;
                margin-bottom: 32px;
                border: 1px solid rgba(0,0,0,0.03);
            }

            .detail-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 14px;
            }

            .label { color: var(--text-secondary); }
            .value { font-weight: 600; font-family: 'SF Mono', 'Menlo', monospace; letter-spacing: -0.5px; }

            .btn {
                display: block;
                width: 100%;
                padding: 18px;
                background: #000;
                color: #fff;
                text-decoration: none;
                border-radius: 18px;
                font-weight: 600;
                font-size: 17px;
                transition: transform 0.2s;
                cursor: pointer;
            }

            .btn:active { transform: scale(0.96); }

            /* Shimmer Effect */
            .shimmer {
                position: absolute;
                top: 0; left: 0; width: 100%; height: 100%;
                background: linear-gradient(to right, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%);
                transform: skewX(-20deg) translateX(-150%);
                animation: shimmer 3s infinite;
                pointer-events: none;
            }

            @keyframes shimmer {
                100% { transform: skewX(-20deg) translateX(150%); }
            }
        </style>
    </head>
    <body>
        <div class="mesh-bg"></div>
        
        <div class="card">
            <div class="shimmer"></div>
            
            <div class="logo">
                <img src="/logo.png" alt="Logo" onerror="this.style.display='none'">
            </div>

            <div class="icon-wrapper">
                <svg viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </div>

            <h1>تم الدفع بنجاح</h1>
            <p>شكراً لك! تم تأكيد طلبك بنجاح وسيصلك إشعار قريباً.</p>

            <div class="details">
                <div class="detail-row">
                    <span class="label">رقم العملية</span>
                    <span class="value">#${paymentId}</span>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;
  
  console.log('📄 Sending HTML response');
  res.send(html);

  // ✅ Background processing
  setImmediate(async () => {
    try {
      const paymentStatus = await myFatoorah.getPaymentStatus(paymentId, 'PaymentId');
      if (paymentStatus.success && paymentStatus.status === 'Paid') {
        const order = await Order.findById(paymentStatus.reference)
          .populate('cart')
          .populate('user', 'firstName lastName email phone');

        if (order && order.paymentDetails.status !== 'paid') {
          await processSuccessfulPayment(order, paymentStatus);
        }
      }
    } catch (error) {
      console.error('❌ Background processing error:', error);
    }
  });
});

// ❌ Error Callback - iOS 26 Style
exports.paymentError = asyncHandler(async (req, res, next) => {
  const { paymentId, message } = req.query;
  let errorMessage = message || 'فشلت عملية الدفع';

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
            failedAt: kuwaitiDateNow(),
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
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>فشل الدفع</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800&display=swap" rel="stylesheet">
        <style>
            :root {
                --primary: #FF3B30;
                --surface: rgba(255, 255, 255, 0.65);
                --surface-dark: rgba(0, 0, 0, 0.05);
                --blur: 25px;
                --text: #000000;
                --text-secondary: #3C3C4399;
            }

            * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

            body {
                font-family: 'Cairo', -apple-system, BlinkMacSystemFont, sans-serif;
                background: #F2F2F7;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                position: relative;
            }

            /* Mesh Gradient Background */
            .mesh-bg {
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                background: 
                    radial-gradient(at 0% 0%, hsla(0,70%,90%,1) 0, transparent 50%),
                    radial-gradient(at 100% 0%, hsla(10,70%,92%,1) 0, transparent 50%),
                    radial-gradient(at 100% 100%, hsla(0,70%,90%,1) 0, transparent 50%),
                    radial-gradient(at 0% 100%, hsla(10,70%,92%,1) 0, transparent 50%);
                filter: blur(60px);
                z-index: -1;
                animation: breathe 10s ease-in-out infinite alternate;
            }

            @keyframes breathe {
                0% { transform: scale(1); opacity: 0.8; }
                100% { transform: scale(1.1); opacity: 1; }
            }

            .card {
                background: var(--surface);
                backdrop-filter: blur(var(--blur));
                -webkit-backdrop-filter: blur(var(--blur));
                border-radius: 32px;
                padding: 48px 32px;
                width: 90%;
                max-width: 400px;
                text-align: center;
                box-shadow: 
                    0 20px 40px rgba(0,0,0,0.05),
                    0 1px 0 rgba(255,255,255,0.5) inset;
                transform: translateY(20px);
                opacity: 0;
                animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                position: relative;
                overflow: hidden;
            }

            @keyframes slideUp {
                to { transform: translateY(0); opacity: 1; }
            }

            .logo {
                width: 80px;
                height: 80px;
                margin: 0 auto 32px;
                filter: drop-shadow(0 4px 12px rgba(0,0,0,0.08));
                animation: float 6s ease-in-out infinite;
            }

            .logo img { width: 100%; height: 100%; object-fit: contain; }

            @keyframes float {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-6px); }
            }

            .icon-wrapper {
                width: 96px;
                height: 96px;
                background: linear-gradient(135deg, #FF3B30, #FF453A);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 24px;
                box-shadow: 
                    0 12px 24px rgba(255, 59, 48, 0.25),
                    0 0 0 8px rgba(255, 59, 48, 0.1);
                animation: shake 0.8s cubic-bezier(0.36, 0.07, 0.19, 0.97) 0.2s backwards;
            }

            @keyframes shake {
                10%, 90% { transform: translate3d(-1px, 0, 0); }
                20%, 80% { transform: translate3d(2px, 0, 0); }
                30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
                40%, 60% { transform: translate3d(4px, 0, 0); }
            }

            .icon-wrapper svg {
                width: 44px;
                height: 44px;
                stroke: white;
                stroke-width: 3.5;
                stroke-linecap: round;
                stroke-linejoin: round;
                fill: none;
                stroke-dasharray: 100;
                stroke-dashoffset: 100;
                animation: draw 0.8s ease-out 0.6s forwards;
            }

            @keyframes draw { to { stroke-dashoffset: 0; } }

            h1 {
                font-size: 28px;
                font-weight: 800;
                color: var(--text);
                margin-bottom: 12px;
                letter-spacing: -0.5px;
            }

            p {
                font-size: 17px;
                color: var(--text-secondary);
                line-height: 1.5;
                margin-bottom: 32px;
                font-weight: 400;
            }

            .error-box {
                background: rgba(255, 59, 48, 0.08);
                border-radius: 16px;
                padding: 16px;
                margin-bottom: 32px;
                border: 1px solid rgba(255, 59, 48, 0.15);
                color: #FF3B30;
                font-weight: 600;
                font-size: 15px;
            }

            .btn {
                display: block;
                width: 100%;
                padding: 18px;
                background: #000;
                color: #fff;
                text-decoration: none;
                border-radius: 18px;
                font-weight: 600;
                font-size: 17px;
                transition: transform 0.2s;
                cursor: pointer;
            }

            .btn:active { transform: scale(0.96); }
        </style>
    </head>
    <body>
        <div class="mesh-bg"></div>
        
        <div class="card">
            <div class="logo">
                <img src="/logo.png" alt="Logo" onerror="this.style.display='none'">
            </div>

            <div class="icon-wrapper">
                <svg viewBox="0 0 24 24">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </div>

            <h1>فشل الدفع</h1>
            <p>عذراً، لم نتمكن من إتمام عملية الدفع. يرجى التحقق من بياناتك والمحاولة مرة أخرى.</p>


        </div>
        <script>
          setTimeout(function() {
            window.location.href = 'payment-failed?paymentId=${paymentId || ''}&message=${encodeURIComponent(errorMessage)}';
          }, 3000);
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
    return res.status(400).json({ message: 'توقيع غير صالح' });
  }

  if (skipSignatureCheck) {
    console.warn('⚠️ Webhook signature check DISABLED');
  }

  const { Data } = payload;
  
  if (!Data) {
    console.error('❌ Invalid payload: No Data field');
    return res.status(400).json({ message: 'حمولة غير صالحة' });
  }

  const order = await Order.findById(Data.CustomerReference)
    .populate('cart')
    .populate('user', 'firstName lastName email phone');

  if (!order) {
    console.error('❌ Order not found:', Data.CustomerReference);
    return res.status(404).json({ message: 'الطلب غير موجود' });
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
    order.paymentDetails.failedAt = kuwaitiDateNow();
    await order.save();
  }

  console.log('✅ Webhook Complete');
  res.status(200).json({ message: 'تم معالجة "ويب هوك" بنجاح' });
});

// 🔄 Refund
exports.refundPayment = asyncHandler(async (req, res, next) => {
  const { orderId, reason } = req.body;

  const order = await Order.findById(orderId);

  if (!order) {
    return next(new ApiError('الطلب غير موجود', 404));
  }

  if (order.paymentDetails?.status !== 'paid') {
    return next(new ApiError('لم يتم دفع قيمة هذا الطلب بعد', 400));
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
  order.paymentDetails.refundedAt = kuwaitiDateNow();
  await order.save();

  await sendNotification(
    order.user,
    'تم استرجاع المبلغ 💰',
    `تم استرجاع مبلغ ${order.total} د.ك من طلبك رقم ${order._id}`,
    'order'
  );

  res.status(200).json({
    status: 'success',
    message: 'تم استرداد المبلغ بنجاح',
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
  order.paymentDetails.paidAt = kuwaitiDateNow();
  
  // خصم الكميات
  for (const item of order.cartItems) {
    try {
      const updatedProduct = await Product.findByIdAndUpdate(item.product, {
        $inc: { quantity: -item.quantity, sold: item.quantity },
      }, { new: true });

      if (updatedProduct && updatedProduct.quantity <= 0) {
        await Product.findByIdAndDelete(updatedProduct._id);
        console.log(`🗑️ Product ${item.product} deleted (Out of Stock).`);
      }
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