const Quiz = require('../models/Quiz');
const Question = require('../models/Question');
const Attempt = require('../models/Attempt');
const Subject = require('../models/Subject');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { gradeFor, shuffle, logActivity, notify, paginate } = require('../utils/helpers');
const { uploadImage: cloudUpload, isConfigured: cloudinaryReady } = require('../config/cloudinary');
const { toCsv } = require('../utils/csv');

const GRACE_SECONDS = 30; // grace period after the timer ends before submissions are rejected

/** Score an attempt server-side against the question bank. */
const scoreAttempt = async (attempt) => {
  const questionIds = attempt.servedQuestions.map((s) => s.question);
  const questions = await Question.find({ _id: { $in: questionIds } });
  const byId = new Map(questions.map((q) => [String(q._id), q]));

  let score = 0;
  let totalMarks = 0;
  const answered = new Map(attempt.answers.map((a) => [String(a.question), a.answer]));

  attempt.answers = attempt.servedQuestions.map((s) => {
    const q = byId.get(String(s.question));
    const given = (answered.get(String(s.question)) || '').trim();
    const marks = q ? q.marks : 0;
    totalMarks += marks;

    let correct = false;
    if (q && given) {
      correct =
        q.type === 'fillblank'
          ? given.toLowerCase() === q.correctAnswer.trim().toLowerCase()
          : given === q.correctAnswer;
    }
    if (correct) score += marks;
    return { question: s.question, answer: given, correct, marksAwarded: correct ? marks : 0 };
  });

  attempt.score = score;
  attempt.totalMarks = totalMarks;
  attempt.percentage = totalMarks ? Math.round((score / totalMarks) * 1000) / 10 : 0;
  attempt.grade = gradeFor(attempt.percentage);
  attempt.timeTaken = Math.min(
    Math.round((Date.now() - attempt.startedAt.getTime()) / 1000),
    Math.round((attempt.endsAt.getTime() - attempt.startedAt.getTime()) / 1000)
  );
  attempt.submittedAt = new Date();
  return attempt;
};

/** Finalize an attempt (used by both manual submit and violation auto-submit). */
const finalizeAttempt = async (attempt, quiz, { auto = false, reason = 'completed' } = {}) => {
  await scoreAttempt(attempt);
  attempt.passed = attempt.percentage >= quiz.passMark;
  attempt.status = auto ? 'auto-submitted' : 'submitted';
  attempt.submitReason = reason;
  await attempt.save();

  notify(attempt.student, {
    title: 'Quiz Submitted',
    message: `Your attempt for "${quiz.title}" was ${auto ? 'automatically submitted' : 'submitted'}. Score: ${attempt.percentage}%`,
    type: 'results',
  });
  // Alert the quiz owner when an attempt is auto-submitted for cheating
  if (auto && reason !== 'time-up') {
    notify(quiz.createdBy, {
      title: 'Proctoring Alert',
      message: `An attempt on "${quiz.title}" was auto-submitted (${reason}).`,
      type: 'cheating-alert',
    });
  }
  return attempt;
};

// POST /api/attempts/start  { quizId, faceImage? (dataURI), faceDescriptor? [] }
exports.startAttempt = asyncHandler(async (req, res) => {
  const { quizId, faceImage, faceDescriptor } = req.body;
  const quiz = await Quiz.findById(quizId).populate('questions');
  if (!quiz || quiz.status !== 'published') throw new ApiError(404, 'Quiz not available');
  if (String(quiz.classRef) !== String(req.user.classRef)) throw new ApiError(403, 'This quiz is not for your class');

  const now = new Date();
  if (now < quiz.startDate) throw new ApiError(400, 'This quiz has not started yet');
  if (now > quiz.endDate) throw new ApiError(400, 'This quiz has ended');

  // Resume an in-progress attempt if allowed (network interruption recovery)
  const inProgress = await Attempt.findOne({ quiz: quiz._id, student: req.user._id, status: 'in-progress' });
  if (inProgress) {
    if (inProgress.endsAt.getTime() + GRACE_SECONDS * 1000 < Date.now()) {
      await finalizeAttempt(inProgress, quiz, { auto: true, reason: 'time-up' });
    } else if (quiz.settings.allowResume) {
      const questions = await Question.find({ _id: { $in: inProgress.servedQuestions.map((s) => s.question) } });
      const byId = new Map(questions.map((q) => [String(q._id), q]));
      return res.json({
        success: true,
        resumed: true,
        attempt: serveAttempt(inProgress, byId, quiz),
      });
    } else {
      // Multiple sessions / reload without resume permission -> forfeit the open attempt
      await finalizeAttempt(inProgress, quiz, { auto: true, reason: 'session-abandoned' });
      throw new ApiError(409, 'Your previous session was closed and has been submitted. Contact your teacher.');
    }
  }

  const used = await Attempt.countDocuments({ quiz: quiz._id, student: req.user._id, status: { $ne: 'in-progress' } });
  if (used >= quiz.maxAttempts) throw new ApiError(403, 'You have used all your attempts for this quiz');

  // Proctoring: face capture is mandatory when the quiz requires it
  if (quiz.settings.requireProctoring && !faceImage) {
    throw new ApiError(400, 'Face verification image is required to start this quiz');
  }

  // Server-side face matching against the student's stored reference descriptor
  if (quiz.settings.requireProctoring && Array.isArray(faceDescriptor) && faceDescriptor.length) {
    const ref = req.user.faceDescriptor;
    if (Array.isArray(ref) && ref.length === faceDescriptor.length) {
      const dist = Math.sqrt(ref.reduce((sum, v, i) => sum + (v - faceDescriptor[i]) ** 2, 0));
      if (dist > 0.6) {
        const Violation = require('../models/Violation');
        await Violation.create({
          student: req.user._id,
          quiz: quiz._id,
          type: 'face-verification-failed',
          details: `Face distance ${dist.toFixed(3)} exceeded threshold`,
        });
        throw new ApiError(403, 'Face verification failed - your face does not match our records. Contact your teacher.');
      }
    } else if (!ref?.length) {
      // First verification becomes the stored reference face
      await User.updateOne({ _id: req.user._id }, { faceDescriptor });
    }
  }

  // Store the verification photo, but never block the exam if Cloudinary fails
  // (bad credentials, quota, network) - the attempt must still be able to start.
  let faceImageStart;
  if (faceImage && cloudinaryReady()) {
    try {
      faceImageStart = await cloudUpload(faceImage, 'quiz-master/proctoring');
    } catch (err) {
      console.error(`Start face image upload failed: ${err.message}`);
    }
  }

  // Build the served question set (randomized server-side)
  let pool = [...quiz.questions];
  if (quiz.randomizeQuestions) pool = shuffle(pool);
  if (quiz.questionCount > 0 && quiz.questionCount < pool.length) pool = pool.slice(0, quiz.questionCount);

  const served = pool.map((q) => ({
    question: q._id,
    options: quiz.randomizeOptions && q.type === 'mcq' ? shuffle(q.options) : q.options,
  }));

  const attempt = await Attempt.create({
    quiz: quiz._id,
    student: req.user._id,
    servedQuestions: served,
    endsAt: new Date(Date.now() + quiz.duration * 60 * 1000),
    faceImageStart,
  });

  logActivity(req.user._id, 'attempt-started', `Quiz: ${quiz.title}`, req.ip);
  const byId = new Map(pool.map((q) => [String(q._id), q]));
  res.status(201).json({ success: true, resumed: false, attempt: serveAttempt(attempt, byId, quiz) });
});

/** Shape an attempt for the exam client - questions WITHOUT correct answers. */
const serveAttempt = (attempt, questionsById, quiz) => ({
  id: attempt._id,
  quiz: {
    id: quiz._id,
    title: quiz.title,
    duration: quiz.duration,
    passMark: quiz.passMark,
    settings: quiz.settings,
  },
  endsAt: attempt.endsAt,
  answers: attempt.answers.map((a) => ({ question: a.question, answer: a.answer })),
  questions: attempt.servedQuestions.map((s) => {
    const q = questionsById.get(String(s.question));
    return q
      ? { id: q._id, type: q.type, text: q.text, image: q.image?.url || null, options: s.options, marks: q.marks }
      : null;
  }).filter(Boolean),
});

// PATCH /api/attempts/:id/answer  { questionId, answer }  (auto-save)
exports.saveAnswer = asyncHandler(async (req, res) => {
  const { questionId, answer } = req.body;
  const attempt = await Attempt.findOne({ _id: req.params.id, student: req.user._id });
  if (!attempt) throw new ApiError(404, 'Attempt not found');
  if (attempt.status !== 'in-progress') throw new ApiError(400, 'This attempt is already submitted');
  if (attempt.endsAt.getTime() + GRACE_SECONDS * 1000 < Date.now()) throw new ApiError(400, 'Time is up');

  const isServed = attempt.servedQuestions.some((s) => String(s.question) === String(questionId));
  if (!isServed) throw new ApiError(400, 'Question does not belong to this attempt');

  const existing = attempt.answers.find((a) => String(a.question) === String(questionId));
  if (existing) existing.answer = String(answer ?? '');
  else attempt.answers.push({ question: questionId, answer: String(answer ?? '') });

  await attempt.save();
  res.json({ success: true });
});

// POST /api/attempts/:id/submit  { faceImage?, reason? }
exports.submitAttempt = asyncHandler(async (req, res) => {
  const attempt = await Attempt.findOne({ _id: req.params.id, student: req.user._id });
  if (!attempt) throw new ApiError(404, 'Attempt not found');
  if (attempt.status !== 'in-progress') throw new ApiError(400, 'Attempt already submitted');

  const quiz = await Quiz.findById(attempt.quiz);
  const late = attempt.endsAt.getTime() + GRACE_SECONDS * 1000 < Date.now();

  // End-of-exam verification photo
  if (req.body.faceImage && cloudinaryReady()) {
    try {
      attempt.faceImageEnd = await cloudUpload(req.body.faceImage, 'quiz-master/proctoring');
    } catch (err) {
      console.error(`End face upload failed: ${err.message}`);
    }
  }

  const reason = late ? 'time-up' : String(req.body.reason || 'completed').slice(0, 60);
  const auto = late || reason !== 'completed';
  await finalizeAttempt(attempt, quiz, { auto, reason });

  logActivity(req.user._id, 'attempt-submitted', `Quiz: ${quiz.title} - ${attempt.percentage}% (${reason})`, req.ip);
  res.json({
    success: true,
    result: {
      score: attempt.score,
      totalMarks: attempt.totalMarks,
      percentage: attempt.percentage,
      grade: attempt.grade,
      passed: attempt.passed,
      status: attempt.status,
      submitReason: attempt.submitReason,
    },
  });
});

// ---------------------------------------------------------------- Results

/** Restrict result queries by role. */
const resultFilterForRole = async (user, query = {}) => {
  const filter = { status: { $ne: 'in-progress' } };
  if (user.role === 'student') filter.student = user._id;
  if (user.role === 'teacher') {
    const mySubjects = await Subject.find({ teachers: user._id }).distinct('_id');
    const myQuizzes = await Quiz.find({ subject: { $in: mySubjects } }).distinct('_id');
    filter.quiz = { $in: myQuizzes };
  }
  if (query.quiz) {
    // Intersect with role scope
    if (filter.quiz && !filter.quiz.$in.some((id) => String(id) === String(query.quiz))) {
      return null; // teacher asked for a quiz outside their subjects
    }
    filter.quiz = query.quiz;
  }
  if (query.student && user.role !== 'student') filter.student = query.student;
  return filter;
};

// GET /api/attempts/results?quiz=&student=&page=
exports.listResults = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req, 15);
  const filter = await resultFilterForRole(req.user, req.query);
  if (!filter) throw new ApiError(403, 'You cannot view results for this quiz');

  const [results, total] = await Promise.all([
    Attempt.find(filter)
      .populate('student', 'name email regNumber')
      .populate({ path: 'quiz', select: 'title passMark subject classRef', populate: { path: 'subject', select: 'name code' } })
      .sort('-submittedAt')
      .skip(skip)
      .limit(limit),
    Attempt.countDocuments(filter),
  ]);
  res.json({ success: true, results, total, page, pages: Math.ceil(total / limit) });
});

// GET /api/attempts/results/:id  (detail incl. per-question breakdown + rank)
exports.getResult = asyncHandler(async (req, res) => {
  const attempt = await Attempt.findById(req.params.id)
    .populate('student', 'name email regNumber')
    .populate({ path: 'quiz', select: 'title passMark subject settings', populate: { path: 'subject', select: 'name code teachers' } })
    .populate('answers.question', 'text type options correctAnswer marks');
  if (!attempt || attempt.status === 'in-progress') throw new ApiError(404, 'Result not found');

  // Access control
  if (req.user.role === 'student' && String(attempt.student._id) !== String(req.user._id)) {
    throw new ApiError(403, 'You can only view your own results');
  }
  if (req.user.role === 'teacher') {
    const teacherIds = (attempt.quiz.subject.teachers || []).map(String);
    if (!teacherIds.includes(String(req.user._id))) throw new ApiError(403, 'Not your subject');
  }

  // Rank among best attempts for this quiz
  const best = await Attempt.aggregate([
    { $match: { quiz: attempt.quiz._id, status: { $ne: 'in-progress' } } },
    { $group: { _id: '$student', best: { $max: '$percentage' } } },
    { $sort: { best: -1 } },
  ]);
  const rank = best.findIndex((b) => String(b._id) === String(attempt.student._id)) + 1;

  // Students only see correct answers if the quiz allows review
  const obj = attempt.toObject();
  if (req.user.role === 'student' && !attempt.quiz.settings?.showReview) {
    obj.answers = obj.answers.map((a) => ({ ...a, question: { ...a.question, correctAnswer: undefined } }));
  }

  res.json({ success: true, result: obj, rank, totalStudents: best.length });
});

// GET /api/attempts/leaderboard/:quizId
exports.leaderboard = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.quizId).populate('subject', 'teachers');
  if (!quiz) throw new ApiError(404, 'Quiz not found');
  if (req.user.role === 'teacher' && !(quiz.subject.teachers || []).map(String).includes(String(req.user._id))) {
    throw new ApiError(403, 'Not your subject');
  }
  if (req.user.role === 'student' && String(quiz.classRef) !== String(req.user.classRef)) {
    throw new ApiError(403, 'Not your class');
  }

  const board = await Attempt.aggregate([
    { $match: { quiz: quiz._id, status: { $ne: 'in-progress' } } },
    { $group: { _id: '$student', best: { $max: '$percentage' }, attempts: { $sum: 1 } } },
    { $sort: { best: -1 } },
    { $limit: 50 },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'student' } },
    { $unwind: '$student' },
    { $project: { best: 1, attempts: 1, 'student.name': 1, 'student.regNumber': 1 } },
  ]);
  res.json({ success: true, leaderboard: board });
});

// GET /api/attempts/results/export/csv?quiz=<id>
exports.exportResults = asyncHandler(async (req, res) => {
  const filter = await resultFilterForRole(req.user, req.query);
  if (!filter) throw new ApiError(403, 'You cannot export results for this quiz');
  if (req.user.role === 'student') throw new ApiError(403, 'Students cannot export results');

  const results = await Attempt.find(filter)
    .populate('student', 'name email regNumber')
    .populate({ path: 'quiz', select: 'title subject', populate: { path: 'subject', select: 'code' } })
    .sort('-submittedAt');

  const csv = toCsv(results, [
    { label: 'Student', value: (r) => r.student?.name || '' },
    { label: 'RegNumber', value: (r) => r.student?.regNumber || '' },
    { label: 'Email', value: (r) => r.student?.email || '' },
    { label: 'Quiz', value: (r) => r.quiz?.title || '' },
    { label: 'Subject', value: (r) => r.quiz?.subject?.code || '' },
    { label: 'Score', value: 'score' },
    { label: 'Total', value: 'totalMarks' },
    { label: 'Percentage', value: 'percentage' },
    { label: 'Grade', value: 'grade' },
    { label: 'Passed', value: (r) => (r.passed ? 'Yes' : 'No') },
    { label: 'Status', value: 'status' },
    { label: 'SubmitReason', value: 'submitReason' },
    { label: 'TimeTakenSec', value: 'timeTaken' },
    { label: 'SubmittedAt', value: (r) => (r.submittedAt ? r.submittedAt.toISOString() : '') },
  ]);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="results.csv"');
  res.send(csv);
});

module.exports.finalizeAttempt = finalizeAttempt;
