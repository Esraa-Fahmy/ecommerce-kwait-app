const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const compression = require("compression");
const http = require("http"); // لإنشاء السيرفر
const { Server } = require("socket.io");

dotenv.config({ path: "config.env" });
const dbConnection = require("./config/database");
const globalError = require("./middlewares/errmiddleware");
const { initNotificationSystem } = require("./utils/sendNotifications");

dbConnection();

const app = express();
// ✅ IMPORTANT: Webhook route must use express.raw() for signature verification
app.use('/api/v1/payment/webhook', express.raw({ type: 'application/json' }));
// Middleware
app.use(compression());
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "uploads")));
// Serve payment redirect pages from public directory
app.use(express.static(path.join(__dirname, "public")));

// ✅ Serve assetlinks.json for Android App Links verification
app.get('/.well-known/assetlinks.json', (req, res) => {
  const fs = require('fs');
  const filePath = path.join(__dirname, 'public', '.well-known', 'assetlinks.json');
  
  // Check if file exists
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/json');
    const content = fs.readFileSync(filePath, 'utf8');
    res.send(content);
  } else {
    res.status(404).json({ error: 'assetlinks.json not found', path: filePath });
  }
});

// ✅ App Links Routes (must be before /api/v1/payment)
const { paymentSuccess, paymentError } = require("./controllers/paymentController");
app.get('/payment-success', paymentSuccess);
app.get('/payment-failed', paymentError);

// Mount Routes
app.use("/api/v1/categories", require("./routes/category.route"));
app.use("/api/v1/subCategories", require("./routes/subcategory.route"));
app.use("/api/v1/subSubCategories", require("./routes/subSubCategoryRoute"));
app.use("/api/v1/user", require("./routes/user.route"));
app.use("/api/v1/auth", require("./routes/auth.route"));
app.use("/api/v1/product", require("./routes/product.route"));
app.use("/api/v1/offers", require("./routes/offers.route"));
app.use("/api/v1/reviews", require("./routes/review.route"));
app.use("/api/v1/favourite", require("./routes/favouriteList.route"));
app.use("/api/v1/cart", require("./routes/cart.route"));
app.use("/api/v1/shipping", require("./routes/shippingRoute"));
app.use("/api/v1/orders", require("./routes/orderRoute"));
app.use("/api/v1/addresses", require("./routes/addressRoute"));
app.use("/api/v1/notifications", require("./routes/notificationRoute"));
app.use("/api/v1/payment", require("./routes/paymentRoute"));

// Global Error Handler
app.use(globalError);

// ⚙️ إنشاء السيرفر
const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

// ============================
// Socket.io setup
// ============================
const io = new Server(server, {
  cors: {
    origin: "*", // ممكن تحطي الدومين بتاعك
  },
});

// Map للاحتفاظ بالمستخدمين المتصلين
const connectedUsers = new Map();

io.on("connection", (socket) => {
  console.log("✅ مستخدم متصل:", socket.id);

  // تسجيل المستخدم عند الـ login/connection
  socket.on("register", (userId) => {
    connectedUsers.set(userId, socket.id);
    console.log(`📡 المستخدم ${userId} سجل في سوكيت`);
  });

  // عند فصل الاتصال
  socket.on("disconnect", () => {
    for (const [userId, id] of connectedUsers.entries()) {
      if (id === socket.id) connectedUsers.delete(userId);
    }
    console.log("❌ مستخدم فصل الاتصال:", socket.id);
  });
});

// تهيئة نظام الإشعارات
initNotificationSystem(io, connectedUsers);

// تشغيل السيرفر
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
