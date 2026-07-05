const User = require('../models/User');
const Subject = require('../models/Subject');
const Department = require('../models/Department');
const ClassModel = require('../models/ClassModel');
const Quiz = require('../models/Quiz');
const Attempt = require('../models/Attempt');
const Violation = require('../models/Violation');
const ActivityLog = require('../models/ActivityLog');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { logActivity, paginate, escapeRegex, notify } = require('../utils/helpers');
const { isConfigured: cloudinaryReady, uploadImage: cloudUpload, deleteImage } = require('../config/cloudinary');

// GET /api/admin/cloudinary-test  - verify image storage works (runs on the live server)
exports.testCloudinary = asyncHandler(async (req, res) => {
  const present = {
    CLOUDINARY_CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: !!process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: !!process.env.CLOUDINARY_API_SECRET,
  };
  if (!cloudinaryReady()) {
    const missing = Object.keys(present).filter((k) => !present[k]);
    return res.json({ success: false, message: `Missing Cloudinary variable(s): ${missing.join(', ')}`, present });
  }
  // 1x1 transparent PNG
  const img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
  try {
    const r = await cloudUpload(img, 'quiz-master/test');
    await deleteImage(r.publicId);
    res.json({ success: true, message: 'Cloudinary is connected — photos will be saved.', present });
  } catch (err) {
    res.json({ success: false, message: `Cloudinary rejected the upload: ${err.message}`, present });
  }
});

// ---------------------------------------------------------------- Dashboard

// GET /api/admin/dashboard
exports.dashboard = asyncHandler(async (req, res) => {
  const now = new Date();
  const [teachers, students, subjects, quizzes, activeQuizzes, completedQuizzes, attempts, recentLogs] =
    await Promise.all([
      User.countDocuments({ role: 'teacher' }),
      User.countDocuments({ role: 'student' }),
      Subject.countDocuments(),
      Quiz.countDocuments(),
      Quiz.countDocuments({ status: 'published', startDate: { $lte: now }, endDate: { $gte: now } }),
      Quiz.countDocuments({ endDate: { $lt: now } }),
      Attempt.countDocuments({ status: { $ne: 'in-progress' } }),
      ActivityLog.find().sort('-createdAt').limit(10).populate('user', 'name role'),
    ]);

  const quizStats = await Attempt.aggregate([
    { $match: { status: { $ne: 'in-progress' } } },
    {
      $group: {
        _id: null,
        avgScore: { $avg: '$percentage' },
        passed: { $sum: { $cond: ['$passed', 1, 0] } },
        total: { $sum: 1 },
      },
    },
  ]);

  res.json({
    success: true,
    stats: {
      teachers,
      students,
      subjects,
      quizzes,
      activeQuizzes,
      completedQuizzes,
      attempts,
      avgScore: quizStats[0] ? Math.round(quizStats[0].avgScore * 10) / 10 : 0,
      passRate: quizStats[0] && quizStats[0].total ? Math.round((quizStats[0].passed / quizStats[0].total) * 100) : 0,
    },
    recentActivities: recentLogs,
  });
});

// ---------------------------------------------------------------- Users

// GET /api/admin/users?role=&search=&status=&page=&limit=
exports.listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req);
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.classId) filter.classRef = req.query.classId;
  if (req.query.search) {
    const rx = new RegExp(escapeRegex(req.query.search), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { regNumber: rx }];
  }
  const [users, total] = await Promise.all([
    User.find(filter)
      .populate('department', 'name')
      .populate('classRef', 'name')
      .populate('subjects', 'name code')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({ success: true, users, total, page, pages: Math.ceil(total / limit) });
});

// POST /api/admin/users  { name, email, password, role, department, classRef, subjects, regNumber }
exports.createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, department, classRef, subjects, regNumber, phone } = req.body;
  if (!['teacher', 'student', 'admin'].includes(role)) throw new ApiError(400, 'Invalid role');

  const user = await User.create({
    name,
    email,
    password,
    role,
    department: department || undefined,
    classRef: role === 'student' ? classRef || undefined : undefined,
    subjects: role === 'teacher' ? subjects || [] : [],
    regNumber,
    phone,
  });

  // Keep Subject.teachers in sync for assigned teachers
  if (role === 'teacher' && Array.isArray(subjects) && subjects.length) {
    await Subject.updateMany({ _id: { $in: subjects } }, { $addToSet: { teachers: user._id } });
  }

  logActivity(req.user._id, 'user-created', `Created ${role}: ${email}`, req.ip);
  res.status(201).json({ success: true, user: { ...user.toObject(), password: undefined } });
});

// PUT /api/admin/users/:id
exports.updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');

  const { name, email, department, classRef, subjects, regNumber, phone, status } = req.body;
  if (name) user.name = name;
  if (email) user.email = email;
  if (regNumber !== undefined) user.regNumber = regNumber;
  if (phone !== undefined) user.phone = phone;
  if (department !== undefined) user.department = department || undefined;
  if (status && ['active', 'suspended'].includes(status)) user.status = status;
  if (user.role === 'student' && classRef !== undefined) user.classRef = classRef || undefined;

  if (user.role === 'teacher' && Array.isArray(subjects)) {
    await Subject.updateMany({ teachers: user._id }, { $pull: { teachers: user._id } });
    await Subject.updateMany({ _id: { $in: subjects } }, { $addToSet: { teachers: user._id } });
    user.subjects = subjects;
  }

  await user.save();
  logActivity(req.user._id, 'user-updated', `Updated user: ${user.email}`, req.ip);
  res.json({ success: true, user });
});

// PATCH /api/admin/users/:id/status  { status: 'active' | 'suspended' }
exports.setUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['active', 'suspended'].includes(status)) throw new ApiError(400, 'Invalid status');
  const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!user) throw new ApiError(404, 'User not found');
  logActivity(req.user._id, 'user-status', `${status === 'suspended' ? 'Suspended' : 'Activated'} ${user.email}`, req.ip);
  res.json({ success: true, user });
});

// PATCH /api/admin/users/:id/reset-password  { newPassword }
exports.adminResetPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || String(newPassword).length < 6) throw new ApiError(400, 'Password must be at least 6 characters');
  const user = await User.findById(req.params.id).select('+password');
  if (!user) throw new ApiError(404, 'User not found');
  user.password = String(newPassword);
  await user.save();
  logActivity(req.user._id, 'admin-password-reset', `Reset password for ${user.email}`, req.ip);
  res.json({ success: true, message: 'Password reset successfully' });
});

// DELETE /api/admin/users/:id
exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  if (String(user._id) === String(req.user._id)) throw new ApiError(400, 'You cannot delete your own account');

  await Subject.updateMany({ teachers: user._id }, { $pull: { teachers: user._id } });
  await user.deleteOne();
  logActivity(req.user._id, 'user-deleted', `Deleted user: ${user.email}`, req.ip);
  res.json({ success: true, message: 'User deleted' });
});

// ---------------------------------------------------------------- Departments

exports.listDepartments = asyncHandler(async (req, res) => {
  const departments = await Department.find().sort('name');
  res.json({ success: true, departments });
});

exports.createDepartment = asyncHandler(async (req, res) => {
  const department = await Department.create(req.body);
  logActivity(req.user._id, 'department-created', department.name, req.ip);
  res.status(201).json({ success: true, department });
});

exports.updateDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!department) throw new ApiError(404, 'Department not found');
  res.json({ success: true, department });
});

exports.deleteDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findByIdAndDelete(req.params.id);
  if (!department) throw new ApiError(404, 'Department not found');
  res.json({ success: true, message: 'Department deleted' });
});

// ---------------------------------------------------------------- Classes

exports.listClasses = asyncHandler(async (req, res) => {
  const classes = await ClassModel.find().populate('department', 'name').sort('name');
  res.json({ success: true, classes });
});

exports.createClass = asyncHandler(async (req, res) => {
  const cls = await ClassModel.create(req.body);
  logActivity(req.user._id, 'class-created', cls.name, req.ip);
  res.status(201).json({ success: true, class: cls });
});

exports.updateClass = asyncHandler(async (req, res) => {
  const cls = await ClassModel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!cls) throw new ApiError(404, 'Class not found');
  res.json({ success: true, class: cls });
});

exports.deleteClass = asyncHandler(async (req, res) => {
  const cls = await ClassModel.findByIdAndDelete(req.params.id);
  if (!cls) throw new ApiError(404, 'Class not found');
  res.json({ success: true, message: 'Class deleted' });
});

// ---------------------------------------------------------------- Logs

// GET /api/admin/logs
exports.listLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req, 20);
  const [logs, total] = await Promise.all([
    ActivityLog.find().sort('-createdAt').skip(skip).limit(limit).populate('user', 'name email role'),
    ActivityLog.countDocuments(),
  ]);
  res.json({ success: true, logs, total, page, pages: Math.ceil(total / limit) });
});
