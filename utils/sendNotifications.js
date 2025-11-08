const Notification = require("../models/notificationModel");

let ioInstance = null;
let connectedUsers = new Map();

// 🧠 دالة تهيئة النظام (تستدعيها مرة في server.js)
exports.initNotificationSystem = (io, usersMap) => {
  ioInstance = io;
  connectedUsers = usersMap;
};

// 🔔 دالة إرسال إشعار
exports.sendNotification = async (userId, title, message, type = "system") => {
  if (!ioInstance) {
    console.error("❌ Notification system not initialized!");
    return;
  }

  // 1️⃣ خزّن الإشعار في قاعدة البيانات
  const notification = await Notification.create({
    user: userId,
    title,
    message,
    type,
  });

  // 2️⃣ لو المستخدم متصل بسوكيت، ابعتله الإشعار مباشرة
  const socketId = connectedUsers.get(userId.toString());
  if (socketId) {
    ioInstance.to(socketId).emit("notification", notification);
  }

  return notification;
};
