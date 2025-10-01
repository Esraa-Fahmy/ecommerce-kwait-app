const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const fs = require('fs');
const Product = require("../models/product.model");
const User = require("../models/user.model");
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const { uploadMixOfImages } = require('../midlewares/uploadImageMiddleWare');
const SubCategory = require("../models/subcategory.model");
const SubSubCategory = require('../models/subSubCategory.model')

exports.uploadStoryImages = uploadMixOfImages([
    { name: 'imageCover', maxCount: 1 },
    { name: 'images', maxCount: 10 }
]);


exports.resizeStoryImages = asyncHandler(async (req, res, next) => {
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
