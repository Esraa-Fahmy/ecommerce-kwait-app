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





// GET ALL PRODUCTS (robust)
exports.getAllProducts = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
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

  // defaults
  let wishlistIds = [];
  let wishlistCount = 0;
  const cartMap = {}; // { productId: quantity }
  let cartCount = 0;

  if (req.user) {
    // اجلب اليوزر من DB مرة تانية للتأكد (بيعكس أي تحديث)
    const freshUser = await User.findById(req.user._id).select("wishlist").lean();
    wishlistIds = (freshUser?.wishlist || []).map(id => id.toString());
    wishlistCount = wishlistIds.length;

    const cart = await cartModel.findOne({ user: req.user._id }).lean();
    if (cart) {
      cartCount = cart.cartItems.length;
      cart.cartItems.forEach(item => {
        const pid = item.product._id ? item.product._id.toString() : item.product.toString();
        cartMap[pid] = (cartMap[pid] || 0) + (item.quantity || 0);
      });
    }
  }

  const formattedProducts = products.map(p => {
    const prod = p.toObject(); // safe copy
    const pid = prod._id.toString();
    prod.isWishlist = wishlistIds.includes(pid);
    prod.isCart = !!cartMap[pid];
    prod.cartQuantity = cartMap[pid] || 0;
    prod.wishlistCount = wishlistCount;
    prod.cartCount = cartCount;
    return prod;
  });

  res.status(200).json({
    status: "success",
    results: formattedProducts.length,
    totalProducts,
    totalPages,
    currentPage: page,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    data: formattedProducts,
  });
});

// GET SINGLE PRODUCT (robust)
exports.getSingleProduct = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const productDoc = await ProductModel.findById(id)
    .populate("category", "name")
    .populate("subCategory", "name")
    .populate("subSubCategory", "name");

  if (!productDoc) return next(new ApiError(`No product found for id ${id}`, 404));

  const product = productDoc.toObject();

  // defaults
  product.isWishlist = false;
  product.isCart = false;
  product.cartQuantity = 0;
  product.wishlistCount = 0;
  product.cartCount = 0;

  if (req.user) {
    const freshUser = await User.findById(req.user._id).select("wishlist").lean();
    const wishlistIds = (freshUser?.wishlist || []).map(i => i.toString());
    product.wishlistCount = wishlistIds.length;
    product.isWishlist = wishlistIds.includes(product._id.toString());

    const cart = await cartModel.findOne({ user: req.user._id }).lean();
    if (cart) {
      product.cartCount = cart.cartItems.length;
      let qty = 0;
      cart.cartItems.forEach(item => {
        const pid = item.product._id ? item.product._id.toString() : item.product.toString();
        if (pid === product._id.toString()) qty += item.quantity || 0;
      });
      product.cartQuantity = qty;
      product.isCart = qty > 0;
    }
  }

  res.status(200).json({ status: "success", data: product });
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
