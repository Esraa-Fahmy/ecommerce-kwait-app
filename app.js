const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const compression = require("compression");
const http = require("http");
const { Server } = require("socket.io");

dotenv.config({ path: "config.env" });
const dbConnection = require("./config/database");
const globalError = require("./middlewares/errmiddleware");
const { initNotificationSystem } = require("./utils/sendNotifications");

dbConnection();

const app = express();

// ✅ IMPORTANT: Webhook route must use express.raw() for signature verification
app.use('/api/v1/payment/webhook', express.raw({ type: 'application/json' }));

// Regular middleware for other routes
app.use(compression());
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "public")));

// ✅ Serve assetlinks.json for Android App Links
app.get('/.well-known/assetlinks.json', (req, res) => {
  const fs = require('fs');
  const filePath = path.join(__dirname, 'public', '.well-known', 'assetlinks.json');
  
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/json');
    const content = fs.readFileSync(filePath, 'utf8');
    res.send(content);
  } else {
    res.status(404).json({ error: 'assetlinks.json not found' });
  }
});

// ✅ App Links Routes (must be before /api/v1/payment)
const { paymentSuccess, paymentError } = require("./controllers/paymentController");
app.get('/payment-success', paymentSuccess);
app.get('/payment-failed', paymentError);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

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

// 404 handler
app.all('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Can't find ${req.originalUrl} on this server`
  });
});

// Global Error Handler
app.use(globalError);

// ⚙️ Create HTTP Server
const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

// ============================
// Socket.io setup
// ============================
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Map to store connected users
const connectedUsers = new Map();

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  // Register user
  socket.on("register", (userId) => {
    connectedUsers.set(userId, socket.id);
    console.log(`📡 User ${userId} registered in socket`);
  });

  // Disconnect
  socket.on("disconnect", () => {
    for (const [userId, id] of connectedUsers.entries()) {
      if (id === socket.id) {
        connectedUsers.delete(userId);
        console.log(`❌ User ${userId} disconnected`);
      }
    }
  });
});

// Initialize notification system
initNotificationSystem(io, connectedUsers);

// ============================
// Graceful Shutdown
// ============================
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, closing server gracefully');
  server.close(() => {
    console.log('💤 Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('👋 SIGINT received, closing server gracefully');
  server.close(() => {
    console.log('💤 Server closed');
    process.exit(0);
  });
});

// Unhandled rejection handler
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 Socket.io enabled`);
});