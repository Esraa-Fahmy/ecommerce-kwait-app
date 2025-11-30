const User = require("../models/user.model");
const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const fs = require('fs');
const bcrypt = require('bcrypt');
const Order = require("../models/orderModel"); // تأكدي إنه مضاف فوق


const {uploadSingleImage} = require('../middlewares/uploadImageMiddleWare');
const createToken = require("../utils/createToken");
const cartModel = require("../models/cartModel");
const offerModel = require("../models/offer.model");

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
  const limit = req.query.limit * 1 || 30;
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


// Create a new user (Admin only - can only create other admins)
exports.createUser = asyncHandler(async (req, res, next) => {
  // ✅ التحقق من أن الـ role هو admin فقط
  if (req.body.role && req.body.role !== 'admin') {
    return next(new ApiError('You can only create admin users through this endpoint. Regular users must sign up through /api/v1/auth/signup', 400));
  }

  // ✅ إجبار الـ role يكون admin
  req.body.role = 'admin';

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





// 📊 Get App Statistics (Admin Only)
exports.getAppStats = asyncHandler(async (req, res, next) => {
  // ✅ إجمالي المستخدمين
  const totalUsers = await User.countDocuments();

  // ✅ إجمالي الطلبات
  const totalOrders = await Order.countDocuments();

  // ✅ تجميع الطلبات حسب الحالة
  const ordersByStatus = await Order.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  // نجهز الاستجابة بشكل منسق
  const statusCounts = {};
  ordersByStatus.forEach((item) => {
    statusCounts[item._id] = item.count;
  });

  // ✅ إحصائيات المدفوعات
  const paymentStats = await Order.aggregate([
    {
      $match: {
        paymentMethod: 'visa',
        'paymentDetails.status': 'paid'  // فقط المدفوعات الناجحة
      }
    },
    {
      $group: {
        _id: null,
        totalPaidOrders: { $sum: 1 },           // عدد الطلبات المدفوعة
        totalRevenue: { $sum: '$total' },       // إجمالي المبلغ المدفوع
        totalShipping: { $sum: '$shippingCost' }, // إجمالي الشحن
        totalDiscount: { $sum: '$discountValue' }, // إجمالي الخصومات
      }
    }
  ]);

  // ✅ إحصائيات COD (فقط المُسلّمة)
  const codStats = await Order.aggregate([
    {
      $match: {
        paymentMethod: 'cod',
        status: 'delivered'  // ✅ فقط المُسلّمة
      }
    },
    {
      $group: {
        _id: null,
        totalCODOrders: { $sum: 1 },
        totalCODRevenue: { $sum: '$total' },
      }
    }
  ]);

  // ✅ تجميع حسب طريقة الدفع
  const paymentMethodStats = await Order.aggregate([
    {
      $match: {
        $or: [
          { paymentMethod: 'visa', 'paymentDetails.status': 'paid' },
          { paymentMethod: 'cod', status: 'delivered' }  // ✅ فقط المُسلّمة
        ]
      }
    },
    {
      $group: {
        _id: '$paymentMethod',
        count: { $sum: 1 },
        totalAmount: { $sum: '$total' }
      }
    }
  ]);

  // ✅ إحصائيات المبالغ المستردة
  const refundStats = await Order.aggregate([
    {
      $match: {
        'paymentDetails.status': 'refunded'
      }
    },
    {
      $group: {
        _id: null,
        totalRefundedOrders: { $sum: 1 },
        totalRefundedAmount: { $sum: '$total' }
      }
    }
  ]);

  // ✅ إحصائيات حسب الأسبوع الحالي
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const weeklyStats = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: oneWeekAgo },
        $or: [
          { paymentMethod: 'visa', 'paymentDetails.status': 'paid' },
          { paymentMethod: 'cod', status: 'delivered' }  // ✅ فقط المُسلّمة
        ]
      }
    },
    {
      $group: {
        _id: null,
        weeklyOrders: { $sum: 1 },
        weeklyRevenue: { $sum: '$total' }
      }
    }
  ]);

  // ✅ إحصائيات حسب الشهر الحالي
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const monthlyStats = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: oneMonthAgo },
        $or: [
          { paymentMethod: 'visa', 'paymentDetails.status': 'paid' },
          { paymentMethod: 'cod', status: 'delivered' }  // ✅ فقط المُسلّمة
        ]
      }
    },
    {
      $group: {
        _id: null,
        monthlyOrders: { $sum: 1 },
        monthlyRevenue: { $sum: '$total' }
      }
    }
  ]);

  res.status(200).json({
    status: "success",
    data: {
      // معلومات عامة
      totalUsers,
      totalOrders,
      ordersByStatus: statusCounts,

      // إحصائيات المدفوعات
      payments: {
        // Visa Payments
        visa: {
          totalOrders: paymentStats[0]?.totalPaidOrders || 0,
          totalRevenue: paymentStats[0]?.totalRevenue || 0,
          totalShipping: paymentStats[0]?.totalShipping || 0,
          totalDiscount: paymentStats[0]?.totalDiscount || 0,
        },
        
        // COD Payments
        cod: {
          totalOrders: codStats[0]?.totalCODOrders || 0,
          totalRevenue: codStats[0]?.totalCODRevenue || 0,
        },

        // المجموع الكلي
        total: {
          totalOrders: (paymentStats[0]?.totalPaidOrders || 0) + (codStats[0]?.totalCODOrders || 0),
          totalRevenue: (paymentStats[0]?.totalRevenue || 0) + (codStats[0]?.totalCODRevenue || 0),
        },

        // حسب طريقة الدفع
        byMethod: paymentMethodStats.map(item => ({
          method: item._id,
          count: item.count,
          totalAmount: item.totalAmount
        })),

        // المبالغ المستردة
        refunds: {
          totalOrders: refundStats[0]?.totalRefundedOrders || 0,
          totalAmount: refundStats[0]?.totalRefundedAmount || 0,
        },
      },

      // إحصائيات زمنية
      timeBasedStats: {
        weekly: {
          orders: weeklyStats[0]?.weeklyOrders || 0,
          revenue: weeklyStats[0]?.weeklyRevenue || 0,
        },
        monthly: {
          orders: monthlyStats[0]?.monthlyOrders || 0,
          revenue: monthlyStats[0]?.monthlyRevenue || 0,
        }
      }
    },
  });
});

// @desc    Update User FCM Token
// @route   PUT /api/v1/user/fcm-token
// @access  Private/Protect
exports.updateFcmToken = asyncHandler(async (req, res, next) => {
  const { fcmToken } = req.body;

  if (!fcmToken) {
    return next(new ApiError("FCM Token is required", 400));
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { fcmToken },
    { new: true }
  );

  res.status(200).json({
    status: "success",
    message: "FCM Token updated successfully",
    data: user
  });
});








