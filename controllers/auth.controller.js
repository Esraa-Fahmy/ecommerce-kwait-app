const User = require("../models/user.model");
const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");
const createToken = require("../utils/createToken");

// @desc    Signup
// @route   POST /api/v1/auth/signup
// @access  Public
exports.signup = asyncHandler(async (req, res, next) => {
  const user = await User.create({
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email,
    password: req.body.password,
    phone: req.body.phone,
  });
  user.password = undefined;
  const token = createToken(user._id);
  res.status(201).json({ data: user, token });
});

// @desc    Login
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email }).select("+password");

  if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
    return next(new ApiError("Incorrect email or password", 401));
  }

  user.password = undefined;
  const token = createToken(user._id);
  res.status(200).json({ data: user, token });
});

// @desc   make sure the user is logged in
exports.protect = asyncHandler(async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next(new ApiError("You are not login, Please login to get access this route", 401));
  }

  // Verify token
  const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

  // Check if user exists
  const currentUser = await User.findById(decoded.userId);
  if (!currentUser) {
    return next(new ApiError("The user that belong to this token does no longer exist", 401));
  }

  // Check if password changed after token creation
  if (currentUser.passwordChangedAt) {
    const passChangedTimestamp = parseInt(currentUser.passwordChangedAt.getTime() / 1000, 10);
    if (passChangedTimestamp > decoded.iat) {
      return next(new ApiError("User recently changed his password. please login again..", 401));
    }
  }

  req.user = currentUser;
  next();
});

// @desc  Authorization (User Permissions)
exports.allowedTo = (...roles) =>
  asyncHandler(async (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new ApiError("You are not allowed to access this route", 403));
    }
    next();
  });

// @desc    Forgot password
// @route   POST /api/v1/auth/forgotPassword
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new ApiError(`There is no user with that email ${req.body.email}`, 404));
  }

  const resetCode = Math.floor(1000 + Math.random() * 9000).toString();
  const hashedResetCode = crypto.createHash("sha256").update(resetCode).digest("hex");

  user.passwordResetCode = hashedResetCode;
  user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  user.passwordResetVerified = false;

  await user.save();

  const message = `
    <div style="font-family: Tahoma, Arial, sans-serif; direction: rtl; text-align: center; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background-color: #f9f9f9;">
      <h2 style="color: #333;">🔐 طلب إعادة تعيين كلمة المرور</h2>
      <p style="font-size: 16px; color: #555;">
        مرحباً <strong>${user.firstName} ${user.lastName}</strong>،<br>
        لقد استلمنا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك في <strong>تطبيق عروض</strong>.
      </p>
      <p style="font-size: 20px; font-weight: bold; color: #d9534f; letter-spacing: 2px; background-color: #fff; display: inline-block; padding: 10px 20px; border-radius: 5px; border: 1px solid #d9534f; margin: 15px 0;">
        ${resetCode}
      </p>
      <p style="font-size: 14px; color: #777; margin-top: 20px;">
        الرجاء إدخال هذا الرمز لإتمام عملية إعادة تعيين كلمة المرور.<br>
        الرمز صالح لمدة <strong>10 دقائق فقط</strong>.
      </p>
      <p style="font-size: 14px; color: #aaa; margin-top: 20px;">
        مع تحياتنا،<br>
        <strong>فريق تطبيق عروض</strong>
      </p>
    </div>
  `;

  try {
    await sendEmail({
      email: user.email,
      subject: "🔑 رمز إعادة تعيين كلمة المرور - تطبيق عروض (صالح لمدة 10 دقائق)",
      message,
      html: message,
    });
  } catch (err) {
    console.error("EMAIL SENDING ERROR:", err);

    user.passwordResetCode = undefined;
    user.passwordResetExpires = undefined;
    user.passwordResetVerified = undefined;

    await user.save();
    return next(new ApiError("حدث خطأ أثناء إرسال البريد الإلكتروني", 500));
  }

  res.status(200).json({ status: "Success", message: "تم إرسال رمز إعادة تعيين كلمة المرور إلى بريدك الإلكتروني" });
});

// @desc    Verify password reset code
// @route   POST /api/v1/auth/verifyResetCode
// @access  Public
// @desc    Verify password reset code
// @route   POST /api/v1/auth/verifyResetCode
// @access  Public
exports.verifyPassResetCode = asyncHandler(async (req, res, next) => {
  const { email, resetCode } = req.body;

  // 1️⃣ التحقق إن المستخدم بعت الإيميل والكود
  if (!email || !resetCode) {
    return next(new ApiError("Email and reset code are required", 400));
  }

  // 2️⃣ نعمل hash للكود زي ما حفظناه قبل كده
  const hashedResetCode = crypto.createHash("sha256").update(resetCode).digest("hex");

  // 3️⃣ نجيب اليوزر بالإيميل والكود
  const user = await User.findOne({
    email,
    passwordResetCode: hashedResetCode,
    passwordResetExpires: { $gt: Date.now() },
  });

  // 4️⃣ لو مفيش يوزر أو الكود غلط أو انتهت صلاحيته
  if (!user) {
    return next(new ApiError("Reset code invalid or expired", 400));
  }

  // 5️⃣ نحدث الحالة إنه تم التحقق من الكود
  user.passwordResetVerified = true;
  await user.save();

  res.status(200).json({
    status: "Success",
    message: "Reset code verified successfully. You can now reset your password.",
  });
});


// @desc    Reset password
// @route   POST /api/v1/auth/resetPassword
// @access  Public
// @desc    Reset password
// @route   POST /api/v1/auth/resetPassword
// @access  Public
exports.resetPassword = asyncHandler(async (req, res, next) => {
  const { email, newPassword, confirmNewPassword } = req.body;

  if (!email || !newPassword || !confirmNewPassword) {
    return next(new ApiError("Email, new password, and confirmation are required", 400));
  }

  if (newPassword !== confirmNewPassword) {
    return next(new ApiError("Passwords do not match", 400));
  }

  const user = await User.findOne({
    email,
    passwordResetVerified: true,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    return next(new ApiError("Invalid or expired reset code", 400));
  }

  user.password = newPassword;
  user.passwordResetCode = undefined;
  user.passwordResetExpires = undefined;
  user.passwordResetVerified = undefined;

  await user.save();

  const token = createToken(user._id);
  res.status(200).json({
    status: "success",
    message: "Password reset successfully",
    token,
  });
});
