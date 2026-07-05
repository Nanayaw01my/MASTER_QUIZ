const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a base64 data-URI or a buffer to Cloudinary.
 * @param {string|Buffer} file - data URI string or raw buffer
 * @param {string} folder - target Cloudinary folder
 * @returns {Promise<{url:string, publicId:string}>}
 */
const uploadImage = async (file, folder = 'quiz-master') => {
  const options = { folder, resource_type: 'image', overwrite: true };
  let result;
  if (Buffer.isBuffer(file)) {
    result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (err, res) =>
        err ? reject(err) : resolve(res)
      );
      stream.end(file);
    });
  } else {
    result = await cloudinary.uploader.upload(file, options);
  }
  return { url: result.secure_url, publicId: result.public_id };
};

/** Delete an image by publicId (ignores failures). */
const deleteImage = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error(`Cloudinary delete failed: ${err.message}`);
  }
};

const isConfigured = () =>
  Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

module.exports = { cloudinary, uploadImage, deleteImage, isConfigured };
