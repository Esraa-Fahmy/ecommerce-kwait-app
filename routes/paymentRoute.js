// routes/payment.route.js
const express = require('express');
const router = express.Router();
const { protect, allowedTo } = require('../controllers/auth.controller');
const {
  initiatePayment,
  checkPaymentStatus,
  paymentSuccess,
  paymentError,
  paymentWebhook,
  refundPayment,
  getPaymentMethods,
} = require('../controllers/paymentController');
const { initiatePaymentValidator } = require('../validators/payment');

router.get('/methods', protect, allowedTo("user"), getPaymentMethods);

// 💳 بدء الدفع (User فقط)
router.post('/initiate', protect, allowedTo("user"), initiatePaymentValidator, initiatePayment);

// ✅ التحقق من حالة الدفع (للـ Flutter app)
router.get('/check-status/:invoiceId', protect, allowedTo("user"), checkPaymentStatus);

// ✅ Success & Error Callbacks
router.get('/success', paymentSuccess);
router.get('/error', paymentError);

// 🔔 Webhook من MyFatoorah
router.post('/webhook', paymentWebhook);

// 🔄 Refund (Admin فقط)
router.post('/refund', protect, allowedTo('admin'), refundPayment);

module.exports = router;