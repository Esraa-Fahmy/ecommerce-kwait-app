// models/order.model.js
const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.ObjectId, ref: 'Product', required: true }, // reference original
  productCode: String,
  title: String,
  description: String,
  imageCover: String,
  selectedAttributes: { // the attributes user chose (color/size/material/other)
    type: Map,
    of: String,
    default: {}
  },
  quantity: { type: Number, required: true, default: 1 },
  price: { type: Number, required: true }, // original price per unit
  priceAfterOffer: { type: Number }, // per unit after offer (not multiplied)
}, { _id: true });

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
  items: [orderItemSchema],

  shippingAddress: {
    firstName: String,
    lastName: String,
    type: String, // 'home' | 'work' | 'other'
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

  paymentMethod: {
    type: String,
    enum: ['cod', 'card'],
    required: true,
  },

  shippingPrice: { type: Number, default: 0 },

  // coupon/offer summary
  coupon: {
    code: String,
    discountType: String, // percentage | fixed
    discountValue: Number,
  },

  // totals
  totalBeforeDiscount: { type: Number, required: true }, // sum original (items * qty) + shipping (if you want)
  totalDiscount: { type: Number, default: 0 }, // numeric amount discounted
  totalAfterDiscount: { type: Number, required: true }, // final payable (includes shipping if COD)
  discountDetails: [{
    source: String, // e.g. 'offer(product:xxx)', 'coupon:XYZ', 'flashSale'
    type: String, // percentage | fixed
    value: Number, // if percentage store percent else store fixed
    amount: Number // actual money amount discounted
  }],

  status: {
    type: String,
    enum: ['pending','confirmed','in_preparation','out_for_delivery','delivered','cancelled_by_user','rejected','returned','refunded','delivery_failed'],
    default: 'pending'
  },

  isPaid: { type: Boolean, default: false },
  paidAt: Date,
  createdAtClient: Date, // optional timestamp user provided

}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
