// models/shipping.model.js
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
    default: []
  },
  // ✅ Backward compatibility - keep cost field for migration
  cost: {
    type: Number,
    min: [0, 'Shipping cost cannot be negative']
  },
}, { timestamps: true });

// ✅ Pre-save hook: If only cost is provided, create default standard shipping type
shippingSchema.pre('save', function(next) {
  if (this.cost && (!this.shippingTypes || this.shippingTypes.length === 0)) {
    this.shippingTypes = [{
      type: 'standard',
      name: 'شحن عادي',
      cost: this.cost,
      deliveryTime: '2-3 أيام',
      deliveryHours: 48,
      cutoffTime: null,
      isActive: true
    }];
  }
  next();
});

module.exports = mongoose.model('Shipping', shippingSchema);
