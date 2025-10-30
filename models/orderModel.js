// models/order.model.js
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
  paymentMethod: { type: String, enum: ['visa', 'cod'], default: 'cod' },
  shippingCost: { type: Number, default: 0 },
  coupon: { type: String },
  discountValue: { type: Number, default: 0 },
  subtotal: { type: Number, required: true },
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: [
      'pending','confirmed','in_preparation','out_for_delivery',
      'delivered','cancelled_by_user','rejected','returned',
      'refunded','delivery_failed'
    ],
    default: 'pending'
  }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
