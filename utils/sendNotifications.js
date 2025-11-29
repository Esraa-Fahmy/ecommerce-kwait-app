const Notification = require("../models/notificationModel");

let ioInstance = null;
let connectedUsers = new Map();

// 🧠 دالة تهيئة النظام (تستدعيها مرة في server.js)
exports.initNotificationSystem = (io, usersMap) => {
  ioInstance = io;
  connectedUsers = usersMap;
};

// 🔔 دالة إرسال إشعار
// 🔔 دالة إرسال إشعار
exports.sendNotification = async (userId, title, message, type = "system") => {
  try {
    // 1️⃣ خزّن الإشعار في قاعدة البيانات
    const notification = await Notification.create({
      user: userId,
      title,
      message,
      type,
    });

    // 2️⃣ لو المستخدم متصل بسوكيت، ابعتله الإشعار مباشرة
    if (ioInstance) {
      const socketId = connectedUsers.get(userId.toString());
      if (socketId) {
        ioInstance.to(socketId).emit("notification", notification);
      }
    } else {
      console.warn("⚠️ Socket.io instance not initialized");
    }

    // 3️⃣ إرسال Push Notification عبر Firebase
    const User = require("../models/user.model");
    const admin = require("../config/firebase");
    
    const user = await User.findById(userId);
    if (user && user.fcmToken) {
      try {
        await admin.messaging().send({
          token: user.fcmToken,
          notification: {
            title: title,
            body: message,
          },
          data: {
            type: type,
            notificationId: notification._id.toString()
          }
        });
        console.log(`✅ Push notification sent to user ${userId}`);
      } catch (firebaseError) {
        console.error("❌ Firebase send error:", firebaseError.message);
        // Optional: Handle invalid token (remove it if invalid)
        if (firebaseError.code === 'messaging/registration-token-not-registered') {
           await User.findByIdAndUpdate(userId, { fcmToken: null });
        }
      }
    }

    return notification;
  } catch (error) {
    console.error("❌ Notification Error:", error);
  }
};
