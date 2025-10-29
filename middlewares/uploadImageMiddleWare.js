const multer = require('multer');
const path = require('path');
const ApiError = require('../utils/apiError');
const fs = require('fs');

// تخزين الصور على الهارد
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = file.fieldname + '-' + Date.now() + ext;
    cb(null, name);
  }
});

// فلتر للصور
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new ApiError('Only Images allowed', 400), false);
  }
};

const upload = multer({ storage: multerStorage, fileFilter: multerFilter });

exports.uploadSingleImage = (fieldName) => upload.single(fieldName);

exports.uploadMixOfImages = (arrayOfFields) => upload.fields(arrayOfFields);
