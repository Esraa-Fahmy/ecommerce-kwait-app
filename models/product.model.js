const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  code: {
  type: String,
  unique: true,
  required: [true, 'Product code is required'],
  trim: true,
},
  title: {
    type: String,
    required: [true, 'Product name required'],
    trim: true,
    minlength: [3, 'Too short product name'],
    maxlength: [40, ' Too long product name'],
  },
  slug: {
    type: String,
    lowercase: true,
  },
  description : {
    type : String,
    required: [true, 'description for product is required'],
  },
  quantity : {
    type: Number,
    required : [true, 'product quantity is required']
  },
  sold : {
    type : Number,
    default :0 
  },
  price : {
    type : Number,
    required : [true, ' Product price is required']
  },
  priceAfterDiscount : Number,
  imageCover: {
    type: String,
  },
images : [String],
colors : [String],
sizes : [String],
Material : String,
attributes: {
    type: Map,
    of: String,
    default: {},
  },
category: {
  type: mongoose.Schema.ObjectId,
    ref: 'Category'
  },

  subCategory: [{
    type: mongoose.Schema.ObjectId,
    ref: 'subCategory',
  }],
  subSubCategory: [{
    type: mongoose.Schema.ObjectId,
    ref: 'SubSubCategory',
  }],
  ratingsAverage : {
    type :Number,
    min: [1, 'Rating must be above or equal 1'],
    max: [5, 'Rating must be below or equal 5'],
    default: 0,

  },
  ratingsQuantity: {
    type: Number,
    default :0
  },
 
}, { timestamps: true });





const setImageURL = (doc) => {
  if (doc.imageCover && !doc.imageCover.startsWith(process.env.BASE_URL)) {
      const imageUrl = `${process.env.BASE_URL}/products/${doc.imageCover}`;
      doc.imageCover = imageUrl;
  }
  if (doc.images) {
      const imagesList = [];
      doc.images.forEach((image) => {
          const imageUrl = image.startsWith(process.env.BASE_URL)
              ? image
              : `${process.env.BASE_URL}/products/${image}`;
          imagesList.push(imageUrl);
      });
      doc.images = imagesList;
  }
};

  // findOne, findAll and update
  productSchema.post('init', (doc) => {
    setImageURL(doc);
  });

  // create
  productSchema.post('save', (doc) => {
    setImageURL(doc);
  });

module.exports = mongoose.model('Product', productSchema)