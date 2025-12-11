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
  const page = req.query.page * 1 || 1;
  const limit = req.query.limit * 1 || 6;
  const skip = (page - 1) * limit;

  // فلترة بالـ search
  const searchQuery = req.query.search
    ? { name: { $regex: req.query.search, $options: "i" } }
    : {};

  // إجمالي عدد الكاتيجوريز بعد الفلترة
  const totalCategories = await CategoryModel.countDocuments(searchQuery);

  // حساب عدد الصفحات
  const totalPages = Math.ceil(totalCategories / limit);

  // جلب البيانات
  let query = CategoryModel.find(searchQuery);

  // ✅ شرط إلغاء الـ Pagination
  if (req.query.all !== 'true') {
    query = query.skip(skip).limit(limit);
  }

  const categories = await query;

  res.status(200).json({
    results: categories.length,
    totalCategories,
    totalPages: req.query.all === 'true' ? 1 : totalPages,
    currentPage: req.query.all === 'true' ? 1 : page,
    hasNextPage: req.query.all === 'true' ? false : page < totalPages,
    hasPrevPage: req.query.all === 'true' ? false : page > 1,
    data: categories
  });
});






exports.createCategory = asyncHandler(async (req, res) => {
const category = await CategoryModel.create(req.body);
res.status(201).json({ data: category})

});


exports.getSingleCategory = asyncHandler(async (req, res, next) => {
    const { id } =req.params;
    const category = await CategoryModel.findById(id);
    if(!category) {
       return next(new ApiError(`لا توجد فئة بهذا المعرف ${id}`, 404));
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
    return next(new ApiError(`لا توجد فئة بهذا المعرف ${id}`, 404));
}
res.status(200).json({ data: category })});




exports.deleteCategory = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const  category = await CategoryModel.findByIdAndDelete(id);


if (!category){
    return next(new ApiError(`لا توجد فئة بهذا المعرف ${id}`, 404));
}
res.status(200).json({ message : 'تم حذف الفئة بنجاح' })});