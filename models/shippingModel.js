// models/shippingModel.js
const mongoose = require('mongoose');

const shippingTypeSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['standard', 'express', 'same_day'],
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  cost: {
    type: Number,
    required: true,
    min: [0, 'Shipping cost cannot be negative']
  },
  deliveryTime: {
    type: String,
    required: true,
    trim: true
  },
  deliveryHours: {
    type: Number,
    required: true,
    min: 0
  },
  cutoffTime: {
    type: String,
    default: null,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { _id: true });

const shippingSchema = new mongoose.Schema({
  city: {
    type: String,
    required: [true, 'City name is required'],
    unique: true,
    trim: true
  },
  shippingTypes: {
    type: [shippingTypeSchema],
    required: [true, 'At least one shipping type is required'],
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'At least one shipping type must be provided'
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('Shipping', shippingSchema);
