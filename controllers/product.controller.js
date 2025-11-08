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

  let wishlistIds = [];
  let wishlistCount = 0;
  let cartMap = {};
  let cartCount = 0;

  if (req.user) {
    const user = await User.findById(req.user._id).select("wishlist");
    wishlistIds = user.wishlist.map(id => id.toString());
    wishlistCount = wishlistIds.length;

    const cart = await cartModel.findOne({ user: req.user._id });
    if (cart) {
      cart.cartItems.forEach(item => {
        const prodId = item.product._id ? item.product._id.toString() : item.product.toString();
        if (!cartMap[prodId]) cartMap[prodId] = 0;
        cartMap[prodId] += item.quantity;
      });
      cartCount = cart.cartItems.length; // عدد العناصر
    }
  }

  const formattedProducts = products.map(p => {
    const product = p.toObject();
    const prodId = product._id.toString();
    product.isWishlist = wishlistIds.includes(prodId);
    product.isCart = !!cartMap[prodId];
    product.cartQuantity = cartMap[prodId] || 0;
    product.wishlistCount = wishlistCount;
    product.cartCount = cartCount;
    return product;
  });

  res.status(200).json({
    results: formattedProducts.length,
    totalProducts,
    totalPages,
    currentPage: page,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    data: formattedProducts,
  });
});



// ============================
// ✅ Get Single Product 
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

  let wishlistIds = [];
  let wishlistCount = 0;
  let cartMap = {};
  let cartCount = 0;

  if (req.user) {
    const user = await User.findById(req.user._id).select("wishlist");
    wishlistIds = user.wishlist.map(id => id.toString());
    wishlistCount = wishlistIds.length;

    const cart = await cartModel.findOne({ user: req.user._id });
    if (cart) {
      cart.cartItems.forEach(item => {
        const prodId = item.product._id ? item.product._id.toString() : item.product.toString();
        if (!cartMap[prodId]) cartMap[prodId] = 0;
        cartMap[prodId] += item.quantity;
      });
      cartCount = cart.cartItems.length;
    }

    const prodId = product._id.toString();
    productData.isWishlist = wishlistIds.includes(prodId);
    productData.isCart = !!cartMap[prodId];
    productData.cartQuantity = cartMap[prodId] || 0;
    productData.wishlistCount = wishlistCount;
    productData.cartCount = cartCount;
  } else {
    productData.isWishlist = false;
    productData.isCart = false;
    productData.cartQuantity = 0;
    productData.wishlistCount = 0;
    productData.cartCount = 0;
  }

  res.status(200).json({ data: productData });
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
