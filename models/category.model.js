const mongoose = require('mongoose');
const subCategoryModel = require('./subcategory.model');
const ProductModel = require('./product.model');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true,
        required: [true, 'Category required'],
        minlength: [3, 'Too short category name'],
        maxlength: [40, ' Too long Category name'],
    },
    slug: {
        type: String,
        lowercase: true,
    },
    image: {
        type: String,
    },
    
}, {timestamps : true}
);


const setImageURL = (doc) => {
    if (doc.image) {
      const imageUrl = `${process.env.BASE_URL}/categories/${doc.image}`;
      doc.image = imageUrl;
    }
  };
  // findOne, findAll and update
  categorySchema.post('init', (doc) => {
    setImageURL(doc);
  });
  
  // create
  categorySchema.post('save', (doc) => {
    setImageURL(doc);
  });



  categorySchema.pre("deleteMany", async function (next) {
    const categories = await this.model.find(this.getFilter()); // جلب جميع التصنيفات قبل الحذف
    const categoryIds = categories.map(cat => cat._id);

    // حذف كل الـ subCategories المرتبطة بهذه التصنيفات
    await subCategoryModel.deleteMany({ category: { $in: categoryIds } });

    // حذف كل الـ Stories المرتبطة بهذه التصنيفات
    await ProductModel.deleteMany({ category: { $in: categoryIds } });

    next();
});


const CategoryModel = mongoose.model('Category', categorySchema)

module.exports = CategoryModel;