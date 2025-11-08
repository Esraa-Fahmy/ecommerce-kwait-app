const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const fs = require('fs');
const ProductModel = require("../models/product.model");
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const { uploadMixOfImages } = require('../middlewares/uploadImageMiddleWare');
const User = require("../models/user.model");
const cartModel = require("../models/cartModel");

exports.uploadProductImages = uploadMixOfImages([
  { name: 'imageCover', maxCount: 1 },
  { name: 'images', maxCount: 10 }
]);

exports.resizeProductImages = asyncHandler(async (req, res, next) => {
  if (req.files.imageCover) {
    const imageCoverFileName = `product-${uuidv4()}-${Date.now()}-cover.jpeg`;
    const path = "uploads/products/";
    if (!fs.existsSync(path)) fs.mkdirSync(path, { recursive: true });
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
        if (!fs.existsSync(path)) fs.mkdirSync(path, { recursive: true });
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

// ============================
// ✅ Get All Products
// ============================
exports.getAllProducts = asyncHandler(async (req, res) => {
  const page = req.query.page * 1 || 1;
  const limit = req.query.limit * 1 || 10;
  const skip = (page - 1) * limit;

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

  let sortOption = { createdAt: -1 };
  if (req.query.topSelling === "true") sortOption = { sold: -1 };

  const totalProducts = await ProductModel.countDocuments(filter);
  const totalPages = Math.ceil(totalProducts / limit);

  const products = await ProductModel.find(filter)
    .populate("category", "name")
    .populate("subCategory", "name")
    .populate("subSubCategory", "name")
    .skip(skip)
    .limit(limit)
    .sort(sortOption);

  let finalProducts = [];

  if (req.user) {
    const user = await User.findById(req.user._id)
      .select("wishlist")
      .populate("wishlist", "_id");

    const wishlistIds = user?.wishlist?.map(p => p._id.toString()) || [];
    const cart = await cartModel.findOne({ user: req.user._id });

    finalProducts = products.map((p) => {
      const product = p.toObject();
      product.isWishlist = wishlistIds.includes(p._id.toString());

      const cartItem = cart?.cartItems?.find(
        (item) => item.product.toString() === p._id.toString()
      );
      product.isCart = !!cartItem;
      product.cartQuantity = cartItem ? cartItem.quantity : 0;

      return product;
    });
  } else {
    finalProducts = products.map((p) => {
      const product = p.toObject();
      product.isWishlist = false;
      product.isCart = false;
      product.cartQuantity = 0;
      return product;
    });
  }

  res.status(200).json({
    status: "success",
    results: finalProducts.length,
    totalProducts,
    totalPages,
    currentPage: page,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    data: finalProducts,
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

  let productData = product.toObject();

  if (req.user) {
    const user = await User.findById(req.user._id)
      .select("wishlist")
      .populate("wishlist", "_id");
    const wishlistIds = user?.wishlist?.map(p => p._id.toString()) || [];
    const cart = await cartModel.findOne({ user: req.user._id });

    productData.isWishlist = wishlistIds.includes(product._id.toString());

    const cartItem = cart?.cartItems?.find(
      (item) => item.product.toString() === product._id.toString()
    );
    productData.isCart = !!cartItem;
    productData.cartQuantity = cartItem ? cartItem.quantity : 0;
  } else {
    productData.isWishlist = false;
    productData.isCart = false;
    productData.cartQuantity = 0;
  }

  res.status(200).json({
    status: "success",
    data: productData,
  });
});

// ============================
// ✅ Create, Update, Delete Product
// ============================
exports.createProduct = asyncHandler(async (req, res) => {
  const product = await ProductModel.create(req.body);
  res.status(201).json({ data: product });
});

exports.updateProduct = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const product = await ProductModel.findByIdAndUpdate(id, req.body, { new: true });

  if (!product) return next(new ApiError(`No product found for this id ${id}`, 404));

  res.status(200).json({ data: product });
});

exports.deleteProduct = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const product = await ProductModel.findByIdAndDelete(id);
  if (!product) return next(new ApiError(`No product found for this id ${id}`, 404));

  res.status(200).json({ message: "Product deleted successfully" });
});
