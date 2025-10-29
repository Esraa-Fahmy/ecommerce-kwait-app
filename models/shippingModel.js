// models/shipping.model.js
const mongoose = require('mongoose');

const shippingSchema = new mongoose.Schema({
  city: {
    type: String,
    required: [true, 'City name is required'],
    unique: true,
    trim: true
  },
  cost: {
    type: Number,
    required: [true, 'Shipping cost is required'],
    min: [0, 'Shipping cost cannot be negative']
  },
}, { timestamps: true });

module.exports = mongoose.model('Shipping', shippingSchema);
