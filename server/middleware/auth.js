const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/** Require a valid access token; attaches req.user. */
const protect = asyncHandler(async (req, res, next) => {
  let token;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) token = header.split(' ')[1];

  if (!token) throw new ApiError(401, 'Not authenticated. Please log in.');

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw new ApiError(401, err.name === 'TokenExpiredError' ? 'Session expired' : 'Invalid token');
  }

  const user = await User.findById(decoded.id).select('-password');
  if (!user) throw new ApiError(401, 'User no longer exists');
  if (user.status === 'suspended') throw new ApiError(403, 'Your account has been suspended');

  req.user = user;
  next();
});

/** Restrict a route to the given roles. Usage: authorize('admin', 'teacher') */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new ApiError(403, 'You do not have permission to perform this action'));
  }
  next();
};

module.exports = { protect, authorize };
