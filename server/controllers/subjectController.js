const Subject = require('../models/Subject');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { logActivity, paginate, escapeRegex } = require('../utils/helpers');

// GET /api/subjects  (admin: all | teacher: assigned | student: subjects of their class)
exports.listSubjects = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req, 50);
  const filter = {};

  if (req.user.role === 'teacher') filter.teachers = req.user._id;
  if (req.user.role === 'student') {
    if (!req.user.classRef) return res.json({ success: true, subjects: [], total: 0, page: 1, pages: 0 });
    filter.classes = req.user.classRef;
  }
  if (req.query.search) {
    const rx = new RegExp(escapeRegex(req.query.search), 'i');
    filter.$or = [{ name: rx }, { code: rx }];
  }

  const [subjects, total] = await Promise.all([
    Subject.find(filter)
      .populate('department', 'name')
      .populate('classes', 'name')
      .populate('teachers', 'name email')
      .sort('name')
      .skip(skip)
      .limit(limit),
    Subject.countDocuments(filter),
  ]);
  res.json({ success: true, subjects, total, page, pages: Math.ceil(total / limit) });
});

// POST /api/subjects  (admin)
exports.createSubject = asyncHandler(async (req, res) => {
  const { name, code, department, classes, teachers, description } = req.body;
  const subject = await Subject.create({ name, code, department, classes, teachers, description });

  if (Array.isArray(teachers) && teachers.length) {
    await User.updateMany(
      { _id: { $in: teachers }, role: 'teacher' },
      { $addToSet: { subjects: subject._id } }
    );
  }
  logActivity(req.user._id, 'subject-created', `${subject.name} (${subject.code})`, req.ip);
  res.status(201).json({ success: true, subject });
});

// PUT /api/subjects/:id  (admin)
exports.updateSubject = asyncHandler(async (req, res) => {
  const subject = await Subject.findById(req.params.id);
  if (!subject) throw new ApiError(404, 'Subject not found');

  const { name, code, department, classes, teachers, description } = req.body;
  if (name) subject.name = name;
  if (code) subject.code = code;
  if (description !== undefined) subject.description = description;
  if (department !== undefined) subject.department = department || undefined;
  if (Array.isArray(classes)) subject.classes = classes;

  if (Array.isArray(teachers)) {
    // Remove subject from teachers no longer assigned, add to new ones
    await User.updateMany({ subjects: subject._id }, { $pull: { subjects: subject._id } });
    await User.updateMany({ _id: { $in: teachers }, role: 'teacher' }, { $addToSet: { subjects: subject._id } });
    subject.teachers = teachers;
  }

  await subject.save();
  logActivity(req.user._id, 'subject-updated', subject.name, req.ip);
  res.json({ success: true, subject });
});

// DELETE /api/subjects/:id  (admin)
exports.deleteSubject = asyncHandler(async (req, res) => {
  const subject = await Subject.findById(req.params.id);
  if (!subject) throw new ApiError(404, 'Subject not found');
  await User.updateMany({ subjects: subject._id }, { $pull: { subjects: subject._id } });
  await subject.deleteOne();
  logActivity(req.user._id, 'subject-deleted', subject.name, req.ip);
  res.json({ success: true, message: 'Subject deleted' });
});
