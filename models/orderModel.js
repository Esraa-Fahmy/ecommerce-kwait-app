const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
  cart: { type: mongoose.Schema.ObjectId, ref: 'Cart', required: true },
  cartItems: [
    {
      product: { type: mongoose.Schema.ObjectId, ref: 'Product', required: true },
      title: String,
      imageCover: String,
      color: String,
      size: String,
      Material: String,
      quantity: Number,
      price: Number,
      priceAfterOffer: Number,
      
      // ✅ معلومات العرض المطبق
      appliedOffer: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
    }
  ],
  address: {
    label: String,
    city: String,
    street: String,
    building: String,
    floor: String,
    apartment: String,
    notes: String,
    phone: String,
  },
  paymentMethod: { type: String, enum: ['visa', 'cod'], required: true },
  
  // ✨ إضافة تفاصيل الدفع
  paymentDetails: {
    invoiceId: String,
    transactionId: String,
    status: { 
      type: String, 
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending'
    },
    paymentMethod: String,
    initiatedAt: Date,
    paidAt: Date,
    failedAt: Date,
    refundId: String,
    refundedAt: Date,
  },

  shippingCost: { type: Number, default: 0 },
  
  // ✅ معلومات نوع الشحن المختار (with ObjectId reference)
  shippingType: {
    _id: {
      type: mongoose.Schema.ObjectId,
      ref: 'ShippingType',
      default: null
    },
    type: {
      type: String,
      enum: ['standard', 'express', 'same_day', 'custom'],
      default: 'standard'
    },
    name: String,
    cost: Number,
    deliveryTime: String,
    selectedAt: {
      type: Date,
      default: Date.now
    }
  },
  
  estimatedDelivery: Date,
  
  coupon: { type: String },
  discountValue: { type: Number, default: 0 },
  subtotal: { type: Number, required: true },
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: [
      'pending','confirmed','in_preparation','out_for_delivery',
      'delivered','cancelled_by_user','rejected','returned',
      'refunded','delivery_failed','failed'
    ],
    default: 'pending'
  }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);