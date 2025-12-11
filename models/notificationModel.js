const mongoose = require("mongoose");
const kuwaitTimestamp = require('./plugins/kuwaitTimestamp');

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["order", "offer", "system", "custom"],
      default: "system",
    },
    // ✅ معرف عرض فريد وسهل القراءة
    displayId: {
      type: String,
      unique: true,
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: false }
);

notificationSchema.plugin(kuwaitTimestamp);

// ✅ إنشاء index على displayId لضمان السرعة والتفرد
notificationSchema.index({ displayId: 1 });

module.exports = mongoose.model("Notification", notificationSchema);

