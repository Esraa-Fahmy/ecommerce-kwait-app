// models/address.model.js
const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
  label: { type: String, enum: ['home', 'work', 'other'], default: 'home' },
  city: { type: String, required: true },
  street: { type: String, required: true },
  building: String,
  floor: String,
  apartment: String,
  notes: { type: String, required: true },
  phone: String,
}, { timestamps: true });

module.exports = mongoose.model('Address', addressSchema);
