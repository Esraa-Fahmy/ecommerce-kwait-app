const mongoose = require('mongoose');
const kuwaitTimestamp = require('./plugins/kuwaitTimestamp');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
    },
    slug: {
      type: String,
      lowercase: true,
    },
    email: {
      type: String,
      required: [true, 'Email required'],
      unique: true,
      lowercase: true,
    },
    phone: String,
    profileImg: {
      type: String,
      default: 'OIP.jpg',
    },
    password: {
      type: String,
      required: [true, 'Password required'],
      minlength: [4, 'Too short password'],
      select: false,
    },
    passwordChangedAt: Date,
    passwordResetCode: String,
    passwordResetExpires: Date,
    passwordResetVerified: Boolean,
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    wishlist: [
      {
        type: mongoose.Schema.ObjectId,
        ref: 'Product',
      },
    ],
    addresses: [
      {
        type: mongoose.Schema.ObjectId,
        ref: 'Address',
      },
    ],
    fcmToken: {
      type: String,
      default: null
    },
  },
  { timestamps: false }
);

userSchema.plugin(kuwaitTimestamp);

// صورة البروفايل
const setImageURL = (doc) => {
  if (doc.profileImg) {
    const imageUrl = `${process.env.BASE_URL}/users/${doc.profileImg}`;
    doc.profileImg = imageUrl;
  }
};

userSchema.post('init', (doc) => {
  setImageURL(doc);
});

userSchema.post('save', (doc) => {
  setImageURL(doc);
});

// تشفير الباسورد
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});


const User = mongoose.model('User', userSchema);

module.exports = User;
