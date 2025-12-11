// models/subSubCategory.model.js
const mongoose = require('mongoose');
const kuwaitTimestamp = require('./plugins/kuwaitTimestamp');
const ProductModel = require('./product.model')


const subSubCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'SubSubCategory required'],
    trim: true,
    minlength: [3, 'Too short SubSubCategory name'],
    maxlength: [40, ' Too long SubSubCategory name'],
  },
  slug: {
    type: String,
    lowercase: true,
  },
  image: {
    type: String,
  },
  // يربطها بالـ SubCategory
  subCategory: {
    type: mongoose.Schema.ObjectId,
    ref: 'subCategory',
    required: [true, 'SubSubCategory must belong to parent SubCategory'],
  },
 
}, { timestamps: false });

subSubCategorySchema.plugin(kuwaitTimestamp);

const setImageURL = (doc) => {
  if (doc.image) {
    const imageUrl = `${process.env.BASE_URL}/subSubCategories/${doc.image}`;
    doc.image = imageUrl;
  }
};

subSubCategorySchema.post('init', (doc) => {
  setImageURL(doc);
});

subSubCategorySchema.post('save', (doc) => {
  setImageURL(doc);
});


// ==== Cascade Delete ====
// لو مسحت SubSubCategory → امسح المنتجات اللي جواها
subSubCategorySchema.pre("deleteMany", async function (next) {
  const subSubCategories = await this.model.find(this.getFilter());
  const subSubCategoryIds = subSubCategories.map(ssc => ssc._id);

  await ProductModel.deleteMany({ subSubCategory: { $in: subSubCategoryIds } });

  next();
});

subSubCategorySchema.pre("findOneAndDelete", async function (next) {
  const subSubCategory = await this.model.findOne(this.getFilter());
  if (subSubCategory) {
    await ProductModel.deleteMany({ subSubCategory: subSubCategory._id });
  }
  next();
});

module.exports = mongoose.model('SubSubCategory', subSubCategorySchema);
