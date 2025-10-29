const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const fs = require('fs');
const ProductModel = require("../models/product.model");
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const { uploadMixOfImages } = require('../middlewares/uploadImageMiddleWare');


exports.uploadProductImages = uploadMixOfImages([
    { name: 'imageCover', maxCount: 1 },
    { name: 'images', maxCount: 10 }
]);


exports.resizeProductImages = asyncHandler(async (req, res, next) => {
    if (req.files.imageCover) {
        const imageCoverFileName = `product-${uuidv4()}-${Date.now()}-cover.jpeg`;

        const path = "uploads/products/";
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path, { recursive: true });
        }
        await sharp(req.files.imageCover[0].buffer)
            .toFormat('jpeg')
            .jpeg({ quality: 100 })
            .toFile(`uploads/products/${imageCoverFileName}`);
        req.body.imageCover = imageCoverFileName;
    }
    if (req.files.images) {
        req.body.images = [];
        await Promise.all(
            req.files.images.map(async (img, index) => {
                const imageName = `product-${uuidv4()}-${Date.now()}-${index + 1}.jpeg`;
                const path = "uploads/products/";
                if (!fs.existsSync(path)) {
                    fs.mkdirSync(path, { recursive: true });
                }
                await sharp(img.buffer)
                    .toFormat('jpeg')
                    .jpeg({ quality: 100 })
                    .toFile(`uploads/products/${imageName}`);
                req.body.images.push(imageName);
            })
        );
    }
    next();
});



// ✅ Get All Products
// ============================
// ✅ Get All Products
exports.getAllProducts = asyncHandler(async (req, res) => {
  const page = req.query.page * 1 || 1;
  const limit = req.query.limit * 1 || 10;
  const skip = (page - 1) * limit;

  // 🔹 فلترة
  const filter = {};
  if (req.query.search) {
    filter.$or = [
      { title: { $regex: req.query.search, $options: "i" } },
      { description: { $regex: req.query.search, $options: "i" } },
      { code: { $regex: req.query.search, $options: "i" } },
    ];
  }
  if (req.query.category) filter.category = req.query.category;
  if (req.query.subCategory) filter.subCategory = req.query.subCategory;
  if (req.query.subSubCategory) filter.subSubCategory = req.query.subSubCategory;

  // 🔹 ترتيب: default الأحدث أولاً
  let sortOption = { createdAt: -1 };
  if (req.query.topSelling === "true") {
    sortOption = { sold: -1 }; // الأعلى مبيعًا أولاً
  }

  // 🔹 إجمالي النتائج
  const totalProducts = await ProductModel.countDocuments(filter);
  const totalPages = Math.ceil(totalProducts / limit);

  // 🔹 جلب المنتجات
  const products = await ProductModel.find(filter)
    .populate("category", "name")
    .populate("subCategory", "name")
    .populate("subSubCategory", "name")
    .skip(skip)
    .limit(limit)
    .sort(sortOption);

  res.status(200).json({
    results: products.length,
    totalProducts,
    totalPages,
    currentPage: page,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    data: products,
  });
});


// ============================
// ✅ Get Single Product
// ============================
exports.getSingleProduct = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const product = await ProductModel.findById(id)
    .populate("category", "name")
    .populate("subCategory", "name")
    .populate("subSubCategory", "name");

  if (!product) {
    return next(new ApiError(`No product found for this id ${id}`, 404));
  }

  res.status(200).json({ data: product });
});

// ============================
// ✅ Create Product
// ============================
exports.createProduct = asyncHandler(async (req, res) => {
  const product = await ProductModel.create(req.body);
  res.status(201).json({ data: product });
});

// ============================
// ✅ Update Product
// ============================
exports.updateProduct = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const product = await ProductModel.findByIdAndUpdate(id, req.body, {
    new: true,
  });

  if (!product) {
    return next(new ApiError(`No product found for this id ${id}`, 404));
  }

  res.status(200).json({ data: product });
});

// ============================
// ✅ Delete Product
// ============================
exports.deleteProduct = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const product = await ProductModel.findByIdAndDelete(id);

  if (!product) {
    return next(new ApiError(`No product found for this id ${id}`, 404));
  }

  res.status(200).json({ message: "Product deleted successfully" });
});
