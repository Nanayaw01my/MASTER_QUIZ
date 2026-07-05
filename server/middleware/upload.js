const multer = require('multer');
const ApiError = require('../utils/ApiError');

// Memory storage: files are streamed straight to Cloudinary, never written to disk.
const storage = multer.memoryStorage();

const imageFilter = (req, file, cb) => {
  if (/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) return cb(null, true);
  cb(new ApiError(400, 'Only PNG, JPG or WEBP images are allowed'));
};

const csvFilter = (req, file, cb) => {
  if (file.mimetype === 'text/csv' || /\.csv$/i.test(file.originalname)) return cb(null, true);
  cb(new ApiError(400, 'Only CSV files are allowed'));
};

const uploadImage = multer({ storage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadCsv = multer({ storage, fileFilter: csvFilter, limits: { fileSize: 2 * 1024 * 1024 } });

module.exports = { uploadImage, uploadCsv };
