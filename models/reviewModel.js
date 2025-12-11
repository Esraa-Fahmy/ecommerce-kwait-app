const mongoose = require('mongoose');
const kuwaitTimestamp = require('./plugins/kuwaitTimestamp');
const productModel = require('./product.model');

const reviewSchema = new mongoose.Schema(
  {
    rating: {
      type: Number,
      min: [1, 'Min rating value is 1'],
      max: [5, 'Max rating value is 5'],
      required: [true, 'Rating is required'],
    },
    comment: {
      type: String,
    },
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'Rating must belong to a user'],
    },
      product: {  // لازم تضيفي ده
      type: mongoose.Schema.ObjectId,
      ref: 'Product',
      required: [true, 'Rating must belong to a product'],
    },
  },
  { timestamps: false }
);

reviewSchema.plugin(kuwaitTimestamp);


// حساب المتوسط وعدد التقييمات بعد كل إضافة أو حذف
reviewSchema.statics.calcAverageRatings = async function(productId) {
  const stats = await this.aggregate([
    { $match: { product: productId } },
    {
      $group: {
        _id: '$product',
        nRating: { $sum: 1 },
        avgRating: { $avg: '$rating' },
      },
    },
  ]);

  if (stats.length > 0) {
    await productModel.findByIdAndUpdate(productId, {
      ratingsQuantity: stats[0].nRating,
      ratingsAverage: stats[0].avgRating,
    });
  } else {
    await productModel.findByIdAndUpdate(productId, {
      ratingsQuantity: 0,
      ratingsAverage: 0,
    });
  }
};

// بعد حفظ أي تقييم
reviewSchema.post('save', function() {
  this.constructor.calcAverageRatings(this.product);
});

// بعد حذف أي تقييم (findOneAndDelete)
reviewSchema.post('findOneAndDelete', async function(doc) {
  if (doc) {
    await doc.constructor.calcAverageRatings(doc.product);
  }
});
module.exports = mongoose.model('Review', reviewSchema);