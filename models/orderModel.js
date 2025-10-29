const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.ObjectId, ref: 'Product', required: true },
  productCode: String,
  title: String,
  description: String,
  imageCover: String,
  selectedAttributes: { type: Map, of: String, default: {} },
  quantity: { type: Number, required: true, default: 1 },
  price: { type: Number, required: true },
  priceAfterOffer: { type: Number },
}, { _id: true });

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
  items: [orderItemSchema],

  shippingAddress: {
    firstName: String,
    lastName: String,
    type: String,
    country: String,
    city: String,
    governorate: String,
    street: String,
    building: String,
    apartment: String,
    floor: String,
    phone: String,
    note: String,
  },

  paymentMethod: { type: String, enum: ['cod','card'], required: true },
  shippingPrice: { type: Number, default: 0 },

  coupon: {
    code: String,
    discountType: String,
    discountValue: Number
  },

  totalBeforeDiscount: { type: Number, required: true },
  totalDiscount: { type: Number, default: 0 },
  totalAfterDiscount: { type: Number, required: true },
  discountDetails: [{
    source: String,
    type: String,
    value: Number,
    amount: Number
  }],

  status: {
    type: String,
    enum: [
      'pending','confirmed','in_preparation','out_for_delivery','delivered',
      'cancelled_by_user','rejected','returned','refunded','delivery_failed'
    ],
    default: 'pending'
  },

  isPaid: { type: Boolean, default: false },
  paidAt: Date,
  createdAtClient: Date
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
