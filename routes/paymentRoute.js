
// routes/paymentRoute.js
const express = require('express');
const router = express.Router();
const { protect, allowedTo } = require('../controllers/auth.controller');
const {
  initiatePayment,
  checkPaymentStatus,
  paymentWebhook,
  refundPayment,
  getPaymentMethods,
} = require('../controllers/paymentController');
const { 
  initiatePaymentValidator, 
  refundPaymentValidator 
} = require('../validators/payment');

// ✅ Public routes first (no auth)
// 🔔 Webhook من MyFatoorah (MUST be before auth middleware)
router.post('/webhook', paymentWebhook);

// ✅ Protected routes (require auth)
// 📋 Get available payment methods
router.get('/methods', protect, allowedTo("user"), getPaymentMethods);

// 💳 Initiate payment
router.post(
  '/initiate', 
  protect, 
  allowedTo("user"), 
  initiatePaymentValidator, 
  initiatePayment
);

// ✅ Check payment status (Polling endpoint)
router.get(
  '/check-status/:invoiceId', 
  protect, 
  allowedTo("user"), 
  checkPaymentStatus
);

// 🔄 Refund (Admin only)
router.post(
  '/refund', 
  protect, 
  allowedTo('admin'), 
  refundPaymentValidator, 
  refundPayment
);

module.exports = router;