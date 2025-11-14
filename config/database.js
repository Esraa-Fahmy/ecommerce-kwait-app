const mongoose = require('mongoose');

const dbConnection = () => {
  // إعدادات محسّنة للـ connection
  mongoose.set('strictQuery', false);
  
  const options = {
    // Timeout settings (مهم جداً)
    serverSelectionTimeoutMS: 60000, // 60 ثانية
    socketTimeoutMS: 60000,
    connectTimeoutMS: 60000,
    
    // Connection pool (زيادة عدد الاتصالات)
    maxPoolSize: 50,
    minPoolSize: 10,
    
    // Retry settings
    retryWrites: true,
    retryReads: true,
    
    // Other optimizations
    maxIdleTimeMS: 30000,
    bufferCommands: false, // مهم: عدم buffer الأوامر
  };

  mongoose.connect(process.env.DB_URI, options)
    .then((conn) => {
      console.log(`✅ Database connected: ${conn.connection.host}`);
    })
    .catch((err) => {
      console.error(`❌ Database Error: ${err.message}`);
      process.exit(1);
    });

  // Handle connection events
  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected! Attempting to reconnect...');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected successfully');
  });

  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err.message);
  });
};

module.exports = dbConnection;