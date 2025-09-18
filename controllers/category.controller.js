const CategoryModel = require("../models/category.model");
const asyncHandler = require('express-async-handler');
const ApiError = require("../utils/apiError");
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const fs = require('fs');


const {uploadSingleImage} = require('../middlewares/uploadImageMiddleWare')

// Upload single image
exports.uploadCategoryImage = uploadSingleImage('image');

// Image processing
exports.resizeImage = asyncHandler(async (req, res, next) => {
  const filename = `category-${uuidv4()}-${Date.now()}.jpeg`;

  if (req.file) {

  const path = "uploads/categories/";
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path, { recursive: true });
        }

    await sharp(req.file.buffer)
      .toFormat('jpeg')
      .jpeg({ quality: 100 })
      .toFile(`uploads/categories/${filename}`);

    // Save image into our db
    req.body.image = filename;
  }

  next();
});



exports.getAllCategories = asyncHandler(async (req, res) => {
    const page = req.query.page * 1  || 1;
    const limit = req.query.limit * 1 || 6;
    const skip = (page - 1) * limit


    const searchQuery = req.query.search ? {
        name: { $regex: req.query.search, $options: "i" }
    } : {};

    const categories = await CategoryModel.find(searchQuery)
        .skip(skip)
        .limit(limit);

res.status(200).json({results: categories.length, page, data: categories})
});


exports.createCategory = asyncHandler(async (req, res) => {


const category = await CategoryModel.create(req.body);
res.status(201).json({ data: category})

});


exports.getSingleCategory = asyncHandler(async (req, res, next) => {
    const { id } =req.params;
    const category = await CategoryModel.findById(id);
    if(!category) {
       return next(new ApiError(`No category for this id ${id}`, 404));
    }
    res.status(200).json({ data: category })
});



exports.updateCategory = asyncHandler( async (req, res, next) => {
const { id } = req.params;
const { name, image } = req.body;

const  category = await CategoryModel.findByIdAndUpdate(
    {_id: id},
    { name, image},
    { new: true}
);

if (!category){
    return next(new ApiError(`No category for this id ${id}`, 404));
}
res.status(200).json({ data: category })});




exports.deleteCategory = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const  category = await CategoryModel.findByIdAndDelete(id);


if (!category){
    return next(new ApiError(`No category for this id ${id}`, 404));
}
res.status(200).json({ message : 'category deleted successfully' })});