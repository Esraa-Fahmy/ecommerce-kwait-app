const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },

  description: String,

  price: {
    type: Number,
    required: true,
  },

  discountPrice: Number,

  quantity: {
    type: Number,
    default: 0,
  },

  colors: [String], // ["#000000", "#ffffff", "#c69c6d"]

  sizes: [String], // ["S", "M", "L", "XL", "XXL"]

  images: [String], // صور المنتج

  category: {
    type: String,
    enum: ['men', 'women', 'kids'],
    required: true
  },

  subCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubCategory'
  },

  ratingAverage: {
    type: Number,
    default: 0
  },

  ratingCount: {
    type: Number,
    default: 0
  },

  composition: String, // Composition tab
  modelParameter: String, // Model Parameter tab
  productCare: String, // Product Care tab

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Product', productSchema);
