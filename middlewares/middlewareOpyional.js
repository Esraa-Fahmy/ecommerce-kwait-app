const jwt = require("jsonwebtoken");
const User = require("../models/user.model");

exports.optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      req.user = null; // مستخدم مش داخل
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const currentUser = await User.findById(decoded.userId);
    if (!currentUser) {
      req.user = null;
      return next();
    }

    req.user = currentUser;
    next();
  } catch (err) {
    req.user = null; // في حالة توكن بايظ مثلاً
    next();
  }
};
