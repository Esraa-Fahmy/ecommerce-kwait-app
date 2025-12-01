const Notification = require("../models/notificationModel");
const Counter = require("../models/counterModel");

let ioInstance = null;
let connectedUsers = new Map();

// 🧠 دالة تهيئة النظام (تستدعيها مرة في server.js)
exports.initNotificationSystem = (io, usersMap) => {
  ioInstance = io;
  connectedUsers = usersMap;
};

// 🔢 دالة توليد displayId فريد
const generateDisplayId = async (type) => {
  // تحديد البادئة حسب نوع الإشعار
  const prefixes = {
    order: 'ORD',
    offer: 'OFF',
    system: 'SYS',
    custom: 'NOT'
  };

  const prefix = prefixes[type] || 'NOT';
  const counterId = `notification_${type}`;

  // ✅ استخدام findOneAndUpdate مع upsert لضمان الـ atomicity
  const counter = await Counter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  // تنسيق الرقم ليكون 4 أرقام على الأقل (مثل: 0001, 0042, 1234)
  const paddedNumber = String(counter.seq).padStart(4, '0');
  
  return `#${prefix}-${paddedNumber}`;
};

// 🔔 دالة إرسال إشعار
exports.sendNotification = async (userId, title, message, type = "system") => {
  try {
    // ✅ توليد displayId فريد
    const displayId = await generateDisplayId(type);

    // 1️⃣ خزّن الإشعار في قاعدة البيانات
    const notification = await Notification.create({
      user: userId,
      title,
      message,
      type,
      displayId, // ✅ إضافة الـ displayId
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
            notificationId: displayId, // ✅ إرسال المعرف المختصر بدلاً من الطويل
            mongoId: notification._id.toString(), // ✅ الاحتفاظ بالمعرف الأصلي للعمليات الخلفية
            displayId: displayId
          }
        });
        console.log(`✅ Push notification sent to user ${userId} (${displayId})`);
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

