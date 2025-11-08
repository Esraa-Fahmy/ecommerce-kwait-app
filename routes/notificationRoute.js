const express = require("express");
const Auth = require('../controllers/auth.controller');

const {
  getUserNotifications,
  markNotificationsAsRead,
  deleteNotification,
  getUnreadCount,
} = require("../controllers/notificationControlle");

const router = express.Router();


router.get("/",  Auth.protect,  Auth.allowedTo("user"), getUserNotifications);
router.patch("/mark-read", Auth.protect,  Auth.allowedTo("user"), markNotificationsAsRead);
router.delete("/:id", Auth.protect,  Auth.allowedTo("user"), deleteNotification);
router.get("/unread-count", Auth.protect,  Auth.allowedTo("user"), getUnreadCount);

module.exports = router;
