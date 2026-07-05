const Attempt = require('../models/Attempt');
const Quiz = require('../models/Quiz');
const Subject = require('../models/Subject');
const asyncHandler = require('../utils/asyncHandler');

/** Build the quiz-scope filter for the requesting role. */
const quizScope = async (user) => {
  if (user.role === 'admin') return null; // no restriction
  if (user.role === 'teacher') {
    const subjects = await Subject.find({ teachers: user._id }).distinct('_id');
    return await Quiz.find({ subject: { $in: subjects } }).distinct('_id');
  }
  return await Quiz.find({ classRef: user.classRef }).distinct('_id');
};

// GET /api/analytics/overview  (role-aware)
exports.overview = asyncHandler(async (req, res) => {
  const scope = await quizScope(req.user);
  const match = { status: { $ne: 'in-progress' } };
  if (scope) match.quiz = { $in: scope };
  if (req.user.role === 'student') match.student = req.user._id;

  const [summary] = await Attempt.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        avgScore: { $avg: '$percentage' },
        total: { $sum: 1 },
        passed: { $sum: { $cond: ['$passed', 1, 0] } },
        avgTime: { $avg: '$timeTaken' },
      },
    },
  ]);

  res.json({
    success: true,
    overview: {
      avgScore: summary ? Math.round(summary.avgScore * 10) / 10 : 0,
      totalAttempts: summary ? summary.total : 0,
      passRate: summary && summary.total ? Math.round((summary.passed / summary.total) * 100) : 0,
      failRate: summary && summary.total ? Math.round(((summary.total - summary.passed) / summary.total) * 100) : 0,
      avgTimeSeconds: summary ? Math.round(summary.avgTime) : 0,
    },
  });
});

// GET /api/analytics/subjects  - average performance per subject
exports.subjectPerformance = asyncHandler(async (req, res) => {
  const scope = await quizScope(req.user);
  const match = { status: { $ne: 'in-progress' } };
  if (scope) match.quiz = { $in: scope };
  if (req.user.role === 'student') match.student = req.user._id;

  const data = await Attempt.aggregate([
    { $match: match },
    { $lookup: { from: 'quizzes', localField: 'quiz', foreignField: '_id', as: 'quizDoc' } },
    { $unwind: '$quizDoc' },
    { $lookup: { from: 'subjects', localField: 'quizDoc.subject', foreignField: '_id', as: 'subjectDoc' } },
    { $unwind: '$subjectDoc' },
    {
      $group: {
        _id: '$subjectDoc._id',
        subject: { $first: '$subjectDoc.name' },
        avgScore: { $avg: '$percentage' },
        attempts: { $sum: 1 },
        passRate: { $avg: { $cond: ['$passed', 100, 0] } },
      },
    },
    { $sort: { subject: 1 } },
  ]);
  res.json({ success: true, subjects: data.map((d) => ({ ...d, avgScore: Math.round(d.avgScore * 10) / 10, passRate: Math.round(d.passRate) })) });
});

// GET /api/analytics/monthly  - attempts & avg score per month (last 12)
exports.monthly = asyncHandler(async (req, res) => {
  const scope = await quizScope(req.user);
  const match = { status: { $ne: 'in-progress' }, submittedAt: { $gte: new Date(Date.now() - 365 * 24 * 3600 * 1000) } };
  if (scope) match.quiz = { $in: scope };
  if (req.user.role === 'student') match.student = req.user._id;

  const data = await Attempt.aggregate([
    { $match: match },
    {
      $group: {
        _id: { y: { $year: '$submittedAt' }, m: { $month: '$submittedAt' } },
        attempts: { $sum: 1 },
        avgScore: { $avg: '$percentage' },
      },
    },
    { $sort: { '_id.y': 1, '_id.m': 1 } },
  ]);
  res.json({
    success: true,
    monthly: data.map((d) => ({
      month: `${d._id.y}-${String(d._id.m).padStart(2, '0')}`,
      attempts: d.attempts,
      avgScore: Math.round(d.avgScore * 10) / 10,
    })),
  });
});

// GET /api/analytics/top-students  (teacher/admin)
exports.topStudents = asyncHandler(async (req, res) => {
  const scope = await quizScope(req.user);
  const match = { status: { $ne: 'in-progress' } };
  if (scope) match.quiz = { $in: scope };

  const data = await Attempt.aggregate([
    { $match: match },
    { $group: { _id: '$student', avgScore: { $avg: '$percentage' }, attempts: { $sum: 1 } } },
    { $sort: { avgScore: -1 } },
    { $limit: 10 },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'student' } },
    { $unwind: '$student' },
    { $project: { avgScore: { $round: ['$avgScore', 1] }, attempts: 1, 'student.name': 1, 'student.regNumber': 1 } },
  ]);
  res.json({ success: true, students: data });
});
