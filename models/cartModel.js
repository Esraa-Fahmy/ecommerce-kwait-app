const mongoose = require('mongoose');
const kuwaitTimestamp = require('./plugins/kuwaitTimestamp');

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
      
      // ✅ معلومات العرض المطبق
      appliedOffer: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
      
      // ✅ العروض القادمة
      upcomingOffers: {
        type: [mongoose.Schema.Types.Mixed],
        default: [],
      },
    },
  ],

  totalCartPrice: Number, // السعر قبل أي خصم
  totalPriceAfterDiscount: Number, // السعر بعد الخصم
  hasFreeShipping: { type: Boolean, default: false },
  
  // ✅ جميع العروض المطبقة على السلة (array واحد)
  appliedOffers: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },

  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
}, { timestamps: false });

cartSchema.plugin(kuwaitTimestamp);

module.exports = mongoose.model('Cart', cartSchema);