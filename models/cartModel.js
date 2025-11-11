// models/cartModel.js
const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
  cartItems: [
    {
      product: {
        type: mongoose.Schema.ObjectId,
        ref: 'Product',
        required: true,
      },
      title: String,
      imageCover: String,
      Material: String,
      size: String,
      color: String,
      quantity: {
        type: Number,
        default: 1,
      },
      price: Number, // السعر قبل الخصم
      priceAfterOffer: Number, 
      priceTotal: Number,// السعر بعد الخصم إن وجد
    },
  ],

  totalCartPrice: Number,
  totalPriceAfterDiscount: Number,

  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

module.exports = mongoose.model('Cart', cartSchema);
