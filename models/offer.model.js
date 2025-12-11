const mongoose = require('mongoose');
const kuwaitTimestamp = require('./plugins/kuwaitTimestamp');

const offerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Offer title is required'],
    trim: true,
  },

  description: {
    type: String,
    trim: true,
  },

  // ====== نوع العرض (خصم نسبة / خصم ثابت / كوبون / اشترِ واحصل على) ======
  offerType: {
    type: String,
    enum: [
      'percentage',      // خصم نسبة مئوية
      'fixed',           // خصم مبلغ ثابت
      'buyXgetY',        // عرض اشترِ واحصل على
      'freeShipping',    // شحن مجاني
      'cartDiscount',    // خصم على إجمالي السلة
      'coupon',          // كود خصم
    ],
    required: [true, 'Offer type is required'],
  },

  // ====== قيمة الخصم (في حالة percentage أو fixed) ======
  discountValue: {
    type: Number,
  },

  // ====== لو العرض كوبون ======
  couponCode: {
    type: String,
    unique: true,
    sparse: true,
  },

  // ====== عرض buy X get Y ======
  buyQuantity: Number,
  getQuantity: Number,
  discountOnFreeItem: {
    type: Number, // 100% = مجاني، 50% = نصف السعر
  },

  // ====== تحديد الهدف (target) ======
  targetType: {
    type: String,
    enum: ['product', 'subcategory', 'subSubcategory', 'category', 'cart', 'order'],
    required: [true, 'Target type is required'],
  },
  targetIds: [{
    type: mongoose.Schema.ObjectId,
    refPath: 'targetType' // بيربط حسب نوع الهدف
  }],

  // ====== شروط إضافية ======
  minCartValue: Number,     // أقل قيمة سلة لتفعيل العرض
  userGroup: {
    type: String,
    enum: ['all', 'newUser'],
    default: 'all'
  },

  // ====== فترة سريان العرض ======
  startDate: {
    type: Date,
    required: [true, 'Offer start date is required'],
  },
  endDate: {
    type: Date,
    required: [true, 'Offer end date is required'],
  },

  // ====== حالة التفعيل ======
  isActive: {
    type: Boolean,
    default: true,
  },

  // ====== الأولوية لو في أكثر من عرض ======
  priority: {
    type: Number,
    default: 1,
  }

}, { timestamps: false });

offerSchema.plugin(kuwaitTimestamp);

module.exports = mongoose.model('Offer', offerSchema);
