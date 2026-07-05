const Quiz = require('../models/Quiz');
const Question = require('../models/Question');
const Subject = require('../models/Subject');
const User = require('../models/User');
const Attempt = require('../models/Attempt');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { logActivity, notify, paginate, escapeRegex } = require('../utils/helpers');

/** Teachers may only manage quizzes for subjects assigned to them. */
const assertSubjectAccess = async (user, subjectId) => {
  if (user.role === 'admin') return;
  const owns = await Subject.exists({ _id: subjectId, teachers: user._id });
  if (!owns) throw new ApiError(403, 'You are not assigned to this subject');
};

// GET /api/quizzes  (admin: all | teacher: own subjects | student: class quizzes)
exports.listQuizzes = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req, 12);
  const filter = {};
  const now = new Date();

  if (req.user.role === 'teacher') {
    const mySubjects = await Subject.find({ teachers: req.user._id }).distinct('_id');
    filter.subject = { $in: mySubjects };
  } else if (req.user.role === 'student') {
    if (!req.user.classRef) return res.json({ success: true, quizzes: [], total: 0, page: 1, pages: 0 });
    filter.classRef = req.user.classRef;
    filter.status = 'published';
  }

  if (req.query.subject) filter.subject = req.query.subject;
  if (req.query.status && req.user.role !== 'student') filter.status = req.query.status;
  if (req.query.search) filter.title = new RegExp(escapeRegex(req.query.search), 'i');
  // Student convenience filters
  if (req.query.window === 'active') { filter.startDate = { $lte: now }; filter.endDate = { $gte: now }; }
  if (req.query.window === 'upcoming') filter.startDate = { $gt: now };
  if (req.query.window === 'past') filter.endDate = { $lt: now };

  const [quizzes, total] = await Promise.all([
    Quiz.find(filter)
      .populate('subject', 'name code')
      .populate('classRef', 'name')
      .populate('createdBy', 'name')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),
    Quiz.countDocuments(filter),
  ]);

  // For students, attach their attempt usage so the UI can show remaining attempts
  let attemptsByQuiz = {};
  if (req.user.role === 'student' && quizzes.length) {
    const attempts = await Attempt.find({
      student: req.user._id,
      quiz: { $in: quizzes.map((q) => q._id) },
    }).select('quiz status percentage');
    attempts.forEach((a) => {
      const k = String(a.quiz);
      attemptsByQuiz[k] = attemptsByQuiz[k] || { used: 0, inProgress: false, best: 0 };
      if (a.status === 'in-progress') attemptsByQuiz[k].inProgress = true;
      else {
        attemptsByQuiz[k].used += 1;
        attemptsByQuiz[k].best = Math.max(attemptsByQuiz[k].best, a.percentage);
      }
    });
  }

  const data = quizzes.map((q) => {
    const obj = q.toObject();
    delete obj.questions; // never expose the question list in listings
    if (req.user.role === 'student') obj.myAttempts = attemptsByQuiz[String(q._id)] || { used: 0, inProgress: false, best: 0 };
    else obj.questionTotal = q.questions.length;
    return obj;
  });

  res.json({ success: true, quizzes: data, total, page, pages: Math.ceil(total / limit) });
});

// GET /api/quizzes/:id  (teacher/admin - full details incl. questions)
exports.getQuiz = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id)
    .populate('subject', 'name code teachers')
    .populate('classRef', 'name')
    .populate('questions')
    .populate('createdBy', 'name');
  if (!quiz) throw new ApiError(404, 'Quiz not found');

  if (req.user.role === 'student') {
    // Students only get metadata, never questions/answers
    const obj = quiz.toObject();
    delete obj.questions;
    return res.json({ success: true, quiz: obj });
  }
  await assertSubjectAccess(req.user, quiz.subject._id);
  res.json({ success: true, quiz });
});

// POST /api/quizzes  (teacher/admin)
exports.createQuiz = asyncHandler(async (req, res) => {
  const { subject, classRef, questions, startDate, endDate } = req.body;
  await assertSubjectAccess(req.user, subject);
  if (new Date(startDate) >= new Date(endDate)) throw new ApiError(400, 'End date must be after start date');

  if (Array.isArray(questions) && questions.length) {
    const count = await Question.countDocuments({ _id: { $in: questions }, subject });
    if (count !== questions.length) throw new ApiError(400, 'All questions must belong to the quiz subject');
  }

  const quiz = await Quiz.create({ ...req.body, createdBy: req.user._id });
  logActivity(req.user._id, 'quiz-created', quiz.title, req.ip);
  res.status(201).json({ success: true, quiz });
});

// PUT /api/quizzes/:id
exports.updateQuiz = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) throw new ApiError(404, 'Quiz not found');
  await assertSubjectAccess(req.user, quiz.subject);

  const attemptExists = await Attempt.exists({ quiz: quiz._id });
  if (attemptExists && req.body.questions) {
    throw new ApiError(400, 'Cannot change questions after students have attempted this quiz');
  }

  const allowed = [
    'title', 'description', 'duration', 'questionCount', 'randomizeQuestions', 'randomizeOptions',
    'passMark', 'maxAttempts', 'startDate', 'endDate', 'status', 'questions', 'classRef', 'settings',
  ];
  allowed.forEach((k) => {
    if (req.body[k] !== undefined) {
      if (k === 'settings') Object.assign(quiz.settings, req.body.settings);
      else quiz[k] = req.body[k];
    }
  });
  if (quiz.startDate >= quiz.endDate) throw new ApiError(400, 'End date must be after start date');
  await quiz.save();
  res.json({ success: true, quiz });
});

// PATCH /api/quizzes/:id/publish
exports.publishQuiz = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id).populate('subject', 'name');
  if (!quiz) throw new ApiError(404, 'Quiz not found');
  await assertSubjectAccess(req.user, quiz.subject._id);
  if (!quiz.questions.length) throw new ApiError(400, 'Add questions before publishing');

  quiz.status = 'published';
  await quiz.save();

  // Notify all students in the target class
  const students = await User.find({ role: 'student', classRef: quiz.classRef, status: 'active' }).distinct('_id');
  notify(students, {
    title: 'New Quiz Available',
    message: `"${quiz.title}" (${quiz.subject.name}) is now available.`,
    type: 'new-quiz',
  });
  logActivity(req.user._id, 'quiz-published', quiz.title, req.ip);
  res.json({ success: true, quiz });
});

// DELETE /api/quizzes/:id
exports.deleteQuiz = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) throw new ApiError(404, 'Quiz not found');
  await assertSubjectAccess(req.user, quiz.subject);
  const attemptExists = await Attempt.exists({ quiz: quiz._id });
  if (attemptExists) throw new ApiError(400, 'Cannot delete a quiz that has attempts. Archive it instead.');
  await quiz.deleteOne();
  logActivity(req.user._id, 'quiz-deleted', quiz.title, req.ip);
  res.json({ success: true, message: 'Quiz deleted' });
});
