const asyncHandler = require("express-async-handler");
const Notification = require("../models/notificationModel");
const ApiError = require("../utils/apiError");

// 📜 Get all user notifications
exports.getUserNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ user: req.user._id })
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: "success",
    results: notifications.length,
    data: notifications,
  });
});

// 📘 Mark notifications as read
exports.markNotificationsAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { user: req.user._id, isRead: false },
    { isRead: true }
  );

  res.status(200).json({ message: "All notifications marked as read" });
});

// 🗑 Delete single notification
exports.deleteNotification = asyncHandler(async (req, res, next) => {
  const notification = await Notification.findOneAndDelete({
    _id: req.params.id,
    user: req.user._id,
  });

  if (!notification) return next(new ApiError("Notification not found", 404));

  res.status(200).json({ message: "Notification deleted successfully" });
});

// 🔢 Get unread count
exports.getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    user: req.user._id,
    isRead: false,
  });

  res.status(200).json({
    hasNew: count > 0,
    unreadCount: count,
  });
});
