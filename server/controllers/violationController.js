const Violation = require('../models/Violation');
const Attempt = require('../models/Attempt');
const Quiz = require('../models/Quiz');
const Subject = require('../models/Subject');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { notify, paginate } = require('../utils/helpers');
const { finalizeAttempt } = require('./attemptController');
const { uploadImage: cloudUpload, isConfigured: cloudinaryReady } = require('../config/cloudinary');

// Violations that end the exam instantly (no warning allowance)
const INSTANT_SUBMIT = ['tab-switch', 'window-blur', 'camera-disconnected', 'camera-blocked'];

// POST /api/violations  { attemptId, type, details?, snapshot? }  (student, during exam)
exports.reportViolation = asyncHandler(async (req, res) => {
  const { attemptId, type, details, snapshot } = req.body;
  if (!Violation.TYPES.includes(type)) throw new ApiError(400, 'Invalid violation type');

  const attempt = await Attempt.findOne({ _id: attemptId, student: req.user._id });
  if (!attempt) throw new ApiError(404, 'Attempt not found');
  if (attempt.status !== 'in-progress') {
    return res.json({ success: true, autoSubmit: true, message: 'Attempt already closed' });
  }

  const quiz = await Quiz.findById(attempt.quiz);

  // Store the webcam snapshot (evidence) when one was captured and Cloudinary is set up
  let snapshotData;
  if (snapshot && cloudinaryReady()) {
    try {
      snapshotData = await cloudUpload(snapshot, 'quiz-master/violations');
    } catch (err) {
      console.error(`Violation snapshot upload failed: ${err.message}`);
    }
  }

  await Violation.create({
    student: req.user._id,
    quiz: attempt.quiz,
    attempt: attempt._id,
    type,
    details: String(details || '').slice(0, 300),
    snapshot: snapshotData,
  });

  attempt.warningsCount += 1;
  const limit = quiz.settings?.warningLimit || 3;
  const autoSubmit = INSTANT_SUBMIT.includes(type) || attempt.warningsCount >= limit;

  if (autoSubmit) {
    await finalizeAttempt(attempt, quiz, { auto: true, reason: type });
  } else {
    await attempt.save();
  }

  // Alert admins on every violation burst that ends an exam
  if (autoSubmit) {
    const admins = await User.find({ role: 'admin' }).distinct('_id');
    notify(admins, {
      title: 'Cheating Alert',
      message: `${req.user.name}'s attempt on "${quiz.title}" was auto-submitted (${type}).`,
      type: 'cheating-alert',
    });
  }

  res.json({
    success: true,
    autoSubmit,
    warnings: attempt.warningsCount,
    warningLimit: limit,
  });
});

// GET /api/violations?quiz=&student=&type=  (teacher: own subjects | admin: all)
exports.listViolations = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req, 20);
  const filter = {};

  if (req.user.role === 'teacher') {
    const mySubjects = await Subject.find({ teachers: req.user._id }).distinct('_id');
    const myQuizzes = await Quiz.find({ subject: { $in: mySubjects } }).distinct('_id');
    filter.quiz = { $in: myQuizzes };
  }
  if (req.query.quiz) filter.quiz = req.query.quiz;
  if (req.query.student) filter.student = req.query.student;
  if (req.query.type) filter.type = req.query.type;

  const [violations, total] = await Promise.all([
    Violation.find(filter)
      .populate('student', 'name email regNumber')
      .populate('quiz', 'title')
      .sort('-occurredAt')
      .skip(skip)
      .limit(limit),
    Violation.countDocuments(filter),
  ]);
  res.json({ success: true, violations, total, page, pages: Math.ceil(total / limit) });
});
