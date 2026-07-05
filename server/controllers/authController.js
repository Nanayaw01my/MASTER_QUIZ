const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { logActivity } = require('../utils/helpers');
const { signAccessToken, signRefreshToken, setRefreshCookie, clearRefreshCookie } = require('../utils/tokens');
const { uploadImage: cloudUpload, isConfigured: cloudinaryReady } = require('../config/cloudinary');

const publicUser = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  profileImage: u.profileImage?.url || null,
  department: u.department,
  classRef: u.classRef,
  subjects: u.subjects,
  regNumber: u.regNumber,
  phone: u.phone,
  hasFaceReference: Array.isArray(u.faceDescriptor) && u.faceDescriptor.length > 0,
});

// POST /api/auth/login
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, 'Email and password are required');

  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+password');
  if (!user || !(await user.matchPassword(String(password)))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  if (user.status === 'suspended') throw new ApiError(403, 'Your account has been suspended');

  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });
  logActivity(user._id, 'login', `${user.role} logged in`, req.ip);

  setRefreshCookie(res, signRefreshToken(user));
  res.json({ success: true, token: signAccessToken(user), user: publicUser(user) });
});

// POST /api/auth/refresh
exports.refresh = asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) throw new ApiError(401, 'No refresh token');

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const user = await User.findById(decoded.id);
  if (!user || user.status === 'suspended') throw new ApiError(401, 'Account unavailable');

  setRefreshCookie(res, signRefreshToken(user));
  res.json({ success: true, token: signAccessToken(user), user: publicUser(user) });
});

// POST /api/auth/logout
exports.logout = asyncHandler(async (req, res) => {
  clearRefreshCookie(res);
  res.json({ success: true, message: 'Logged out' });
});

// GET /api/auth/me
exports.me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('department', 'name code')
    .populate('classRef', 'name level')
    .populate('subjects', 'name code');
  res.json({ success: true, user: publicUser(user) });
});

// PUT /api/auth/profile  { name, phone }
exports.updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (req.body.name) user.name = String(req.body.name).slice(0, 100);
  if (req.body.phone !== undefined) user.phone = String(req.body.phone).slice(0, 30);
  await user.save();
  res.json({ success: true, user: publicUser(user) });
});

// PUT /api/auth/profile/picture  (multipart "image")
exports.updateProfilePicture = asyncHandler(async (req, res) => {
  if (!cloudinaryReady()) throw new ApiError(503, 'Image uploads are disabled (Cloudinary is not configured)');
  if (!req.file) throw new ApiError(400, 'Image file is required');
  const uploaded = await cloudUpload(req.file.buffer, 'quiz-master/profiles');
  const user = await User.findById(req.user._id);
  user.profileImage = uploaded;
  await user.save({ validateBeforeSave: false });
  res.json({ success: true, profileImage: uploaded.url });
});

// PUT /api/auth/password  { currentPassword, newPassword }
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) throw new ApiError(400, 'Both passwords are required');
  if (String(newPassword).length < 6) throw new ApiError(400, 'New password must be at least 6 characters');

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.matchPassword(String(currentPassword)))) throw new ApiError(401, 'Current password is incorrect');

  user.password = String(newPassword);
  await user.save();
  logActivity(user._id, 'password-change', 'Password changed', req.ip);
  res.json({ success: true, message: 'Password updated' });
});

// POST /api/auth/forgot-password  { email }
exports.forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: String(req.body.email || '').toLowerCase() });
  // Always respond 200 to avoid leaking which emails exist
  if (!user) return res.json({ success: true, message: 'If that email exists, a reset link was generated' });

  const token = user.getResetPasswordToken();
  await user.save({ validateBeforeSave: false });

  // In production wire this to an email service; for now the token is returned
  // so an admin can hand it to the user (or email integration can be added).
  res.json({
    success: true,
    message: 'Reset token generated (valid 15 minutes)',
    resetToken: token,
  });
});

// POST /api/auth/reset-password/:token  { password }
exports.resetPassword = asyncHandler(async (req, res) => {
  const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const user = await User.findOne({
    resetPasswordToken: hashed,
    resetPasswordExpire: { $gt: Date.now() },
  });
  if (!user) throw new ApiError(400, 'Invalid or expired reset token');
  if (!req.body.password || String(req.body.password).length < 6) {
    throw new ApiError(400, 'Password must be at least 6 characters');
  }

  user.password = String(req.body.password);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();
  logActivity(user._id, 'password-reset', 'Password reset via token', req.ip);
  res.json({ success: true, message: 'Password has been reset. You can now log in.' });
});
