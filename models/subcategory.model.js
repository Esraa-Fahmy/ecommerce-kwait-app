const mongoose = require('mongoose');
const kuwaitTimestamp = require('./plugins/kuwaitTimestamp');
const SubSubCategory = require('./subSubCategory.model');
const ProductModel = require('./product.model')




const subCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'subCategory required'],
        minlength: [3, 'Too short subCategory name'],
        maxlength: [40, ' Too long subCategory name'],
    },
    slug: {
        type: String,
        lowercase: true,
    },
    image: {
        type: String,
      },
 category: {
   type: mongoose.Schema.ObjectId,
   ref: 'Category',
   required: [true, 'subCategory must belong to parent category']

 },

}, {timestamps : false}
);

subCategorySchema.plugin(kuwaitTimestamp);



const setImageURL = (doc) => {
  if (doc.image) {
    const imageUrl = `${process.env.BASE_URL}/subCategories/${doc.image}`;
    doc.image = imageUrl;
  }
};
// findOne, findAll and update
subCategorySchema.post('init', (doc) => {
  setImageURL(doc);
});

// create
subCategorySchema.post('save', (doc) => {
  setImageURL(doc);
});



// عند حذف SubCategory → نحذف SubSubCategories والمنتجات المرتبطة
subCategorySchema.pre("deleteMany", async function (next) {
  const subCategories = await this.model.find(this.getFilter());
  const subCategoryIds = subCategories.map(sc => sc._id);

  // نحذف كل SubSubCategories المرتبطة
  await SubSubCategory.deleteMany({ subCategory: { $in: subCategoryIds } });

  // نحذف كل Products المرتبطة بالـ SubCategory
  await ProductModel.deleteMany({ subCategory: { $in: subCategoryIds } });

  next();
});

subCategorySchema.pre("findOneAndDelete", async function (next) {
  const subCategory = await this.model.findOne(this.getFilter());
  if (subCategory) {
    await SubSubCategory.deleteMany({ subCategory: subCategory._id });
    await ProductModel.deleteMany({ subCategory: subCategory._id });
  }
  next();
});


const subCategoryModel = mongoose.model('subCategory', subCategorySchema)

module.exports = subCategoryModel;