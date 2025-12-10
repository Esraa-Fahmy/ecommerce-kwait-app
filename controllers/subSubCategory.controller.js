// controllers/subSubCategory.controller.js
const asyncHandler = require('express-async-handler');
const ApiError = require("../utils/apiError");
const SubSubCategory = require('../models/subSubCategory.model');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const fs = require('fs');
const { uploadSingleImage } = require('../middlewares/uploadImageMiddleWare');

// Upload single image
exports.uploadSubSubCategoryImage = uploadSingleImage('image');

// Image processing
exports.resizeImage = asyncHandler(async (req, res, next) => {
  const filename = `subSubCategory-${uuidv4()}-${Date.now()}.jpeg`;

  if (req.file) {
    const path = "uploads/subSubCategories/";
    if (!fs.existsSync(path)) {
      fs.mkdirSync(path, { recursive: true });
    }

    await sharp(req.file.buffer)
      .toFormat('jpeg')
      .jpeg({ quality: 100 })
      .toFile(`${path}${filename}`);

    req.body.image = filename;
  }

  next();
});

exports.setSubCategoryIdToBody = (req, res, next) => {
  if (!req.body.subCategory) req.body.subCategory = req.params.subCategoryId;
  next();
};


// Get all SubSubCategories
exports.getAllSubSubCategories = asyncHandler(async (req, res) => {
  const page = req.query.page * 1 || 1;
  const limit = req.query.limit * 1 || 6;
  const skip = (page - 1) * limit;

  let filterObject = {};
  if (req.params.subCategoryId) filterObject.subCategory = req.params.subCategoryId;

  if (req.query.search) {
    filterObject.name = { $regex: req.query.search, $options: "i" };
  }

  // ✅ حساب العدد الإجمالي
  const totalSubSubCategories = await SubSubCategory.countDocuments(filterObject);

  // ✅ عدد الصفحات
  const totalPages = Math.ceil(totalSubSubCategories / limit);

  let query = SubSubCategory.find(filterObject);

  if (req.query.all !== 'true') {
    query = query.skip(skip).limit(limit);
  }

  const subSubCategories = await query.populate({ path: "subCategory", select: "name category -_id" });

  res.status(200).json({
    results: subSubCategories.length,
    totalSubSubCategories,
    totalPages: req.query.all === 'true' ? 1 : totalPages,
    currentPage: req.query.all === 'true' ? 1 : page,
    hasNextPage: req.query.all === 'true' ? false : page < totalPages,
    hasPrevPage: req.query.all === 'true' ? false : page > 1,
    data: subSubCategories,
  });
});


// Create
exports.createSubSubCategory = asyncHandler(async (req, res) => {
  const subSubCategory = await SubSubCategory.create(req.body);
  res.status(201).json({ data: subSubCategory });
});

// Get single
exports.getSingleSubSubCategory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const subSubCategory = await SubSubCategory.findById(id)
    .populate('category', 'name -_id')
    .populate('subCategory', 'name -_id');

  if (!subSubCategory) {
    return next(new ApiError(`No SubSubCategory for this id ${id}`, 404));
  }
  res.status(200).json({ data: subSubCategory });
});

// Update
exports.updateSubSubCategory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const subSubCategory = await SubSubCategory.findByIdAndUpdate(id, req.body, { new: true });

  if (!subSubCategory) {
    return next(new ApiError(`No SubSubCategory for this id ${id}`, 404));
  }
  res.status(200).json({ data: subSubCategory });
});

// Delete
exports.deleteSubSubCategory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const subSubCategory = await SubSubCategory.findByIdAndDelete(id);

  if (!subSubCategory) {
    return next(new ApiError(`No SubSubCategory for this id ${id}`, 404));
  }
  res.status(200).json({ message: 'SubSubCategory deleted successfully' });
});
