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
        <title>تم الدفع بنجاح - عروض</title>
        
        <!-- Google Fonts - Cairo for Arabic -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap" rel="stylesheet">
        
        <style>
            /* ============================================
               CSS VARIABLES - Easy theme customization
               ============================================ */
            :root {
              /* Success Colors */
              --success-primary: #10b981;
              --success-light: #34d399;
              --success-dark: #059669;
              
              /* Background Gradient */
              --bg-gradient-start: #0f766e;
              --bg-gradient-end: #10b981;
              
              /* Glassmorphism */
              --glass-bg: rgba(255, 255, 255, 0.95);
              --glass-border: rgba(255, 255, 255, 0.3);
              --glass-shadow: rgba(0, 0, 0, 0.1);
              
              /* Text Colors */
              --text-primary: #1f2937;
              --text-secondary: #6b7280;
              --text-muted: #9ca3af;
              
              /* Spacing */
              --spacing-xs: 8px;
              --spacing-sm: 16px;
              --spacing-md: 24px;
              --spacing-lg: 32px;
              --spacing-xl: 48px;
            }
            
            /* ============================================
               RESET & BASE STYLES
               ============================================ */
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body { 
              font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
              text-align: center; 
              background: linear-gradient(135deg, var(--bg-gradient-start) 0%, var(--bg-gradient-end) 100%);
              min-height: 100vh; 
              display: flex; 
              align-items: center; 
              justify-content: center;
              padding: var(--spacing-md);
              position: relative;
              overflow: hidden;
            }
            
            /* Animated background particles */
            body::before {
              content: '';
              position: absolute;
              width: 200%;
              height: 200%;
              background: radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px);
              background-size: 50px 50px;
              animation: moveBackground 20s linear infinite;
              opacity: 0.3;
            }
            
            @keyframes moveBackground {
              0% { transform: translate(0, 0); }
              100% { transform: translate(50px, 50px); }
            }
            
            /* ============================================
               GLASSMORPHISM CONTAINER
               ============================================ */
            .container { 
              background: var(--glass-bg);
              backdrop-filter: blur(20px);
              -webkit-backdrop-filter: blur(20px);
              padding: var(--spacing-xl);
              border-radius: 24px;
              border: 1px solid var(--glass-border);
              box-shadow: 
                0 8px 32px var(--glass-shadow),
                0 0 0 1px rgba(255, 255, 255, 0.1) inset;
              max-width: 480px;
              width: 100%;
              position: relative;
              z-index: 1;
              animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
            }
            
            @keyframes slideUp {
              from { 
                opacity: 0;
                transform: translateY(30px);
              }
              to { 
                opacity: 1;
                transform: translateY(0);
              }
            }
            
            /* ============================================
               LOGO STYLING
               ============================================ */
            .logo {
              width: 80px;
              height: 80px;
              margin: 0 auto var(--spacing-md);
              animation: fadeIn 0.8s ease-out 0.2s both;
            }
            
            .logo img {
              width: 100%;
              height: 100%;
              object-fit: contain;
              filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.1));
            }
            
            /* ============================================
               SUCCESS ICON WITH ANIMATION
               ============================================ */
            .success-icon { 
              width: 100px;
              height: 100px;
              margin: 0 auto var(--spacing-md);
              background: linear-gradient(135deg, var(--success-light), var(--success-primary));
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 
                0 10px 30px rgba(16, 185, 129, 0.3),
                0 0 0 10px rgba(16, 185, 129, 0.1);
              animation: successPop 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) 0.3s both;
              position: relative;
            }
            
            .success-icon::before {
              content: '';
              position: absolute;
              width: 100%;
              height: 100%;
              border-radius: 50%;
              background: inherit;
              animation: pulse 2s ease-out infinite;
            }
            
            .success-icon svg {
              width: 50px;
              height: 50px;
              stroke: white;
              stroke-width: 3;
              fill: none;
              stroke-linecap: round;
              stroke-linejoin: round;
              position: relative;
              z-index: 1;
            }
            
            .checkmark {
              stroke-dasharray: 100;
              stroke-dashoffset: 100;
              animation: drawCheck 0.8s ease-out 0.5s forwards;
            }
            
            @keyframes successPop {
              0% { 
                transform: scale(0);
                opacity: 0;
              }
              50% {
                transform: scale(1.1);
              }
              100% { 
                transform: scale(1);
                opacity: 1;
              }
            }
            
            @keyframes drawCheck {
              to {
                stroke-dashoffset: 0;
              }
            }
            
            @keyframes pulse {
              0%, 100% {
                opacity: 0;
                transform: scale(1);
              }
              50% {
                opacity: 0.3;
                transform: scale(1.3);
              }
            }
            
            /* ============================================
               TYPOGRAPHY
               ============================================ */
            h1 { 
              color: var(--success-primary);
              margin-bottom: var(--spacing-sm);
              font-size: clamp(24px, 5vw, 32px);
              font-weight: 700;
              animation: fadeIn 0.8s ease-out 0.4s both;
            }
            
            .message { 
              color: var(--text-secondary);
              margin-bottom: var(--spacing-md);
              line-height: 1.8;
              font-size: 16px;
              font-weight: 400;
              animation: fadeIn 0.8s ease-out 0.5s both;
            }
            
            .payment-id {
              display: inline-block;
              background: rgba(16, 185, 129, 0.1);
              color: var(--success-dark);
              padding: var(--spacing-xs) var(--spacing-sm);
              border-radius: 8px;
              font-size: 13px;
              font-weight: 600;
              font-family: 'Courier New', monospace;
              margin-top: var(--spacing-sm);
              animation: fadeIn 0.8s ease-out 0.6s both;
              transition: all 0.3s ease;
            }
            
            .payment-id:hover {
              background: rgba(16, 185, 129, 0.15);
              transform: translateY(-2px);
            }
            
            @keyframes fadeIn {
              from {
                opacity: 0;
                transform: translateY(10px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            
            /* ============================================
               DIVIDER
               ============================================ */
            .divider {
              height: 1px;
              background: linear-gradient(to right, transparent, var(--text-muted), transparent);
              margin: var(--spacing-md) 0;
              opacity: 0.3;
            }
            
            /* ============================================
               FOOTER NOTE
               ============================================ */
            .footer-note {
              color: var(--text-muted);
              font-size: 14px;
              margin-top: var(--spacing-md);
              animation: fadeIn 0.8s ease-out 0.7s both;
            }
            
            /* ============================================
               RESPONSIVE DESIGN
               ============================================ */
            @media (max-width: 480px) {
              .container {
                padding: var(--spacing-md);
              }
              
              .success-icon {
                width: 80px;
                height: 80px;
              }
              
              .success-icon svg {
                width: 40px;
                height: 40px;
              }
              
              .logo {
                width: 60px;
                height: 60px;
              }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <!-- Logo -->
            <div class="logo">
                <img src="/logo_temp2.svg" alt="عروض Logo">
            </div>
            
            <!-- Success Icon with Checkmark -->
            <div class="success-icon">
                <svg viewBox="0 0 52 52">
                    <path class="checkmark" d="M14 27l7 7 16-16"/>
                </svg>
            </div>
            
            <!-- Success Message -->
            <h1>تم الدفع بنجاح!</h1>
            <p class="message">تمت معالجة الدفع بنجاح. يرجى العودة للتطبيق لمتابعة طلبك.</p>
            
            <div class="divider"></div>
            
            <!-- Payment ID -->
            <div class="payment-id">Payment ID: ${paymentId}</div>
            
            <!-- Footer Note -->
            <p class="footer-note">شكراً لاستخدامك تطبيق عروض 💚</p>
        </div>
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
        <title>فشل الدفع - عروض</title>
        
        <!-- Google Fonts - Cairo for Arabic -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap" rel="stylesheet">
        
        <style>
            /* ============================================
               CSS VARIABLES - Easy theme customization
               ============================================ */
            :root {
              /* Error Colors */
              --error-primary: #ef4444;
              --error-light: #f87171;
              --error-dark: #dc2626;
              
              /* Background Gradient */
              --bg-gradient-start: #be123c;
              --bg-gradient-end: #f43f5e;
              
              /* Glassmorphism */
              --glass-bg: rgba(255, 255, 255, 0.95);
              --glass-border: rgba(255, 255, 255, 0.3);
              --glass-shadow: rgba(0, 0, 0, 0.1);
              
              /* Text Colors */
              --text-primary: #1f2937;
              --text-secondary: #6b7280;
              --text-muted: #9ca3af;
              
              /* Spacing */
              --spacing-xs: 8px;
              --spacing-sm: 16px;
              --spacing-md: 24px;
              --spacing-lg: 32px;
              --spacing-xl: 48px;
            }
            
            /* ============================================
               RESET & BASE STYLES
               ============================================ */
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body { 
              font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
              text-align: center; 
              background: linear-gradient(135deg, var(--bg-gradient-start) 0%, var(--bg-gradient-end) 100%);
              min-height: 100vh; 
              display: flex; 
              align-items: center; 
              justify-content: center;
              padding: var(--spacing-md);
              position: relative;
              overflow: hidden;
            }
            
            /* Animated background particles */
            body::before {
              content: '';
              position: absolute;
              width: 200%;
              height: 200%;
              background: radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px);
              background-size: 50px 50px;
              animation: moveBackground 20s linear infinite;
              opacity: 0.3;
            }
            
            @keyframes moveBackground {
              0% { transform: translate(0, 0); }
              100% { transform: translate(50px, 50px); }
            }
            
            /* ============================================
               GLASSMORPHISM CONTAINER
               ============================================ */
            .container { 
              background: var(--glass-bg);
              backdrop-filter: blur(20px);
              -webkit-backdrop-filter: blur(20px);
              padding: var(--spacing-xl);
              border-radius: 24px;
              border: 1px solid var(--glass-border);
              box-shadow: 
                0 8px 32px var(--glass-shadow),
                0 0 0 1px rgba(255, 255, 255, 0.1) inset;
              max-width: 480px;
              width: 100%;
              position: relative;
              z-index: 1;
              animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
            }
            
            @keyframes slideUp {
              from { 
                opacity: 0;
                transform: translateY(30px);
              }
              to { 
                opacity: 1;
                transform: translateY(0);
              }
            }
            
            /* ============================================
               LOGO STYLING
               ============================================ */
            .logo {
              width: 80px;
              height: 80px;
              margin: 0 auto var(--spacing-md);
              animation: fadeIn 0.8s ease-out 0.2s both;
            }
            
            .logo img {
              width: 100%;
              height: 100%;
              object-fit: contain;
              filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.1));
            }
            
            /* ============================================
               ERROR ICON WITH ANIMATION
               ============================================ */
            .error-icon { 
              width: 100px;
              height: 100px;
              margin: 0 auto var(--spacing-md);
              background: linear-gradient(135deg, var(--error-light), var(--error-primary));
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 
                0 10px 30px rgba(239, 68, 68, 0.3),
                0 0 0 10px rgba(239, 68, 68, 0.1);
              animation: errorShake 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) 0.3s both;
              position: relative;
            }
            
            .error-icon::before {
              content: '';
              position: absolute;
              width: 100%;
              height: 100%;
              border-radius: 50%;
              background: inherit;
              animation: pulse 2s ease-out infinite;
            }
            
            .error-icon svg {
              width: 50px;
              height: 50px;
              stroke: white;
              stroke-width: 3;
              fill: none;
              stroke-linecap: round;
              stroke-linejoin: round;
              position: relative;
              z-index: 1;
            }
            
            .x-mark {
              stroke-dasharray: 100;
              stroke-dashoffset: 100;
              animation: drawX 0.8s ease-out 0.5s forwards;
            }
            
            @keyframes errorShake {
              0%, 100% { 
                transform: scale(1) rotate(0deg);
                opacity: 1;
              }
              10%, 30%, 50%, 70%, 90% {
                transform: scale(1.05) rotate(-3deg);
              }
              20%, 40%, 60%, 80% {
                transform: scale(1.05) rotate(3deg);
              }
            }
            
            @keyframes drawX {
              to {
                stroke-dashoffset: 0;
              }
            }
            
            @keyframes pulse {
              0%, 100% {
                opacity: 0;
                transform: scale(1);
              }
              50% {
                opacity: 0.3;
                transform: scale(1.3);
              }
            }
            
            /* ============================================
               TYPOGRAPHY
               ============================================ */
            h1 { 
              color: var(--error-primary);
              margin-bottom: var(--spacing-sm);
              font-size: clamp(24px, 5vw, 32px);
              font-weight: 700;
              animation: fadeIn 0.8s ease-out 0.4s both;
            }
            
            .message { 
              color: var(--text-secondary);
              margin-bottom: var(--spacing-md);
              line-height: 1.8;
              font-size: 16px;
              font-weight: 400;
              animation: fadeIn 0.8s ease-out 0.5s both;
            }
            
            .error-message {
              display: inline-block;
              background: rgba(239, 68, 68, 0.1);
              color: var(--error-dark);
              padding: var(--spacing-sm);
              border-radius: 12px;
              font-size: 14px;
              font-weight: 500;
              margin: var(--spacing-sm) 0;
              animation: fadeIn 0.8s ease-out 0.6s both;
              border: 1px solid rgba(239, 68, 68, 0.2);
            }
            
            @keyframes fadeIn {
              from {
                opacity: 0;
                transform: translateY(10px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            
            /* ============================================
               DIVIDER
               ============================================ */
            .divider {
              height: 1px;
              background: linear-gradient(to right, transparent, var(--text-muted), transparent);
              margin: var(--spacing-md) 0;
              opacity: 0.3;
            }
            
            /* ============================================
               RETRY NOTE
               ============================================ */
            .retry-note {
              color: var(--text-muted);
              font-size: 14px;
              margin-top: var(--spacing-md);
              animation: fadeIn 0.8s ease-out 0.7s both;
            }
            
            /* ============================================
               RESPONSIVE DESIGN
               ============================================ */
            @media (max-width: 480px) {
              .container {
                padding: var(--spacing-md);
              }
              
              .error-icon {
                width: 80px;
                height: 80px;
              }
              
              .error-icon svg {
                width: 40px;
                height: 40px;
              }
              
              .logo {
                width: 60px;
                height: 60px;
              }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <!-- Logo -->
            <div class="logo">
                <img src="/logo_temp2.svg" alt="عروض Logo">
            </div>
            
            <!-- Error Icon with X Mark -->
            <div class="error-icon">
                <svg viewBox="0 0 52 52">
                    <path class="x-mark" d="M16 16 L36 36 M36 16 L16 36"/>
                </svg>
            </div>
            
            <!-- Error Message -->
            <h1>فشل الدفع</h1>
            <p class="message">لم تتم عملية الدفع بنجاح. يرجى المحاولة مرة أخرى.</p>
            
            <div class="divider"></div>
            
            <!-- Error Details -->
            <div class="error-message">${errorMessage}</div>
            
            <!-- Retry Note -->
            <p class="retry-note">يمكنك العودة للتطبيق وإعادة المحاولة 🔄</p>
        </div>
        <script>
          setTimeout(function() {
            window.location.href = 'payment-failed?paymentId=${paymentId || ''}&message=${encodeURIComponent(errorMessage)}';
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