const mongoose = require('mongoose');

const subCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'subCategory required'],
        unique: [true, 'subCategory name must be unique'],
        minlength: [3, 'Too short subCategory name'],
        maxlength: [40, ' Too long subCategory name'],
    },
    slug: {
        type: String,
        lowercase: true,
    },
    image: {
        type: String,
        require: true,
      },
 category: {
   type: mongoose.Schema.ObjectId,
   ref: 'Category',
   required: [true, 'subCategory must belong to parent category']

 },

}, {timestamps : true}
);



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


const subCategoryModel = mongoose.model('subCategory', subCategorySchema)

module.exports = subCategoryModel;