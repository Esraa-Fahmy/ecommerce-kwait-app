const User = require("../models/user.model");
const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const fs = require('fs');
const bcrypt = require('bcrypt');


const {uploadSingleImage} = require('../middlewares/uploadImageMiddleWare');
const createToken = require("../utils/createToken");

// Upload single image
exports.uploadUserImage = uploadSingleImage('profileImg');

// Image processing
exports.resizeImage = asyncHandler(async (req, res, next) => {
  const filename = `user-${uuidv4()}-${Date.now()}.jpeg`;

  if (req.file) {

    const path = "uploads/users/";
            if (!fs.existsSync(path)) {
                fs.mkdirSync(path, { recursive: true });
            }
    await sharp(req.file.buffer)
      .toFormat('jpeg')
      .jpeg({ quality: 100 })
      .toFile(`uploads/users/${filename}`);

    // Save image into our db
    req.body.profileImg = filename;
  }

  next();
});





// Get all users
exports.getUsers = asyncHandler(async (req, res) => {
  const page = req.query.page * 1 || 1;
  const limit = req.query.limit * 1 || 10;
  const skip = (page - 1) * limit;

  const searchQuery = req.query.search
  ? {
      $or: [
        { firstName: { $regex: req.query.search, $options: "i" } },
        { lastName: { $regex: req.query.search, $options: "i" } },
      ]
    }    : {};

  // ✅ حساب العدد الإجمالي للمستخدمين بعد الفلترة
  const totalUsers = await User.countDocuments(searchQuery);

  // ✅ حساب عدد الصفحات تلقائيًا
  const totalPages = Math.ceil(totalUsers / limit);

  const users = await User.find(searchQuery).skip(skip).limit(limit);

  res.status(200).json({
    results: users.length,
    totalUsers,
    totalPages,
    currentPage: page,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    data: users
  });
});


// Create a new user
exports.createUser = asyncHandler(async (req, res) => {
  const user = await User.create(req.body);
  user.password = undefined;
  res.status(201).json({ data: user });
});

// Get user by ID
exports.getUserById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const user = await User.findById(id);
  if (!user) {
    return next(new ApiError(`No user found for ID ${id}`, 404));
  }
  res.status(200).json({ data: user });
});

// Update user
exports.updateUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // استخدام findByIdAndUpdate لتحديث بيانات المستخدم
  const updatedUser = await User.findByIdAndUpdate(
    { _id: id },
    req.body,  // البيانات الجديدة التي سيتم تحديثها
    { new: true }  // العودة بالوثيقة المحدثة
  );

  // التحقق إذا كان المستخدم موجودًا
  if (!updatedUser) {
    return next(new ApiError(`No user found for ID ${id}`, 404));
  }

  // إرسال البيانات المحدثة في الاستجابة
  res.status(200).json({ data: updatedUser });
});






// Delete user
exports.deleteUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const user = await User.findByIdAndDelete(id);

  if (!user) {
    return next(new ApiError(`No user found for ID ${id}`, 404));
  }
  res.status(200).json({ message: "User deleted successfully" });
});




// @desc    Get Logged user data
// @route   GET /api/v1/user/getMe
// @access  Private/Protect
exports.getLoggedUserAccount = asyncHandler (async(req, res, next) => {
  req.params.id = req.user._id;
  next();
})



// @desc    Update logged user password
// @route   PUT /api/v1/users/updateMyPassword
// @access  Private/Protect
exports.updateLoggedUserPassword = asyncHandler(async (req, res, next) => {
  // 1) Update user password based user payload (req.user._id)
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      password: await bcrypt.hash(req.body.password, 12),
      passwordChangedAt: Date.now(),
    },
    {
      new: true,
    }
  );

  // 2) Generate token
  const token = createToken(user._id);

  res.status(200).json({ data: user, token });
});



// @desc    Update logged user data (without password, role)
// @route   PUT /api/v1/users/updateMe
// @access  Private/Protect
exports.updateLoggedUserData = asyncHandler(async (req, res, next) => {
  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    {
       firstName: req.body.firstName,
        lastName: req.body.lastName,
       email: req.body.email,
      phone: req.body.phone,
      profileImg: req.body.profileImg
    },
    { new: true }
  );

  res.status(200).json({ data: updatedUser });
});


// @desc    Delete logged user account
// @route   DELETE /api/v1/users/deleteMe
// @access  Private/Protect
exports.deleteLoggedUserAccount = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndDelete(req.user._id);

  if (!user) {
    return next(new ApiError(`No user found for this account`, 404));
  }

  res.status(200).json({
    status: 'success',
    message: 'Your account has been deleted successfully',
  });
});