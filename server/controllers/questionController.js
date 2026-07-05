const Question = require('../models/Question');
const Subject = require('../models/Subject');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { logActivity, paginate, escapeRegex, notify } = require('../utils/helpers');
const { parseCsv, toCsv } = require('../utils/csv');
const { uploadImage: cloudUpload, isConfigured: cloudinaryReady } = require('../config/cloudinary');
const { generateQuestions: aiGenerate, isConfigured: aiReady } = require('../services/aiQuestionService');

/** Teachers may only touch questions in subjects assigned to them. */
const assertSubjectAccess = async (user, subjectId) => {
  if (user.role === 'admin') return;
  const owns = await Subject.exists({ _id: subjectId, teachers: user._id });
  if (!owns) throw new ApiError(403, 'You are not assigned to this subject');
};

const normalizeQuestion = (body) => {
  const q = {
    subject: body.subject,
    topic: body.topic || 'General',
    type: body.type,
    text: body.text,
    difficulty: body.difficulty || 'medium',
    marks: Number(body.marks) || 1,
    correctAnswer: String(body.correctAnswer || '').trim(),
  };
  if (q.type === 'truefalse') {
    q.options = ['True', 'False'];
    q.correctAnswer = /^t/i.test(q.correctAnswer) ? 'True' : 'False';
  } else if (q.type === 'mcq') {
    q.options = (body.options || []).map((o) => String(o).trim()).filter(Boolean);
    if (q.options.length < 2) throw new ApiError(400, 'MCQ needs at least 2 options');
    if (!q.options.includes(q.correctAnswer)) throw new ApiError(400, 'Correct answer must be one of the options');
  } else if (q.type === 'fillblank') {
    q.options = [];
    if (!q.correctAnswer) throw new ApiError(400, 'Fill-in-the-blank needs an expected answer');
  } else {
    throw new ApiError(400, 'Invalid question type');
  }
  return q;
};

// GET /api/questions?subject=&topic=&difficulty=&type=&search=
exports.listQuestions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req, 15);
  const filter = {};

  if (req.user.role === 'teacher') {
    const mySubjects = await Subject.find({ teachers: req.user._id }).distinct('_id');
    filter.subject = { $in: mySubjects };
  }
  if (req.query.subject) {
    if (req.user.role === 'teacher') await assertSubjectAccess(req.user, req.query.subject);
    filter.subject = req.query.subject;
  }
  if (req.query.topic) filter.topic = new RegExp(escapeRegex(req.query.topic), 'i');
  if (req.query.difficulty) filter.difficulty = req.query.difficulty;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.search) filter.text = new RegExp(escapeRegex(req.query.search), 'i');
  // 'approved' also matches legacy questions created before the status field existed
  if (req.query.status === 'approved') filter.status = { $nin: ['pending', 'rejected'] };
  else if (req.query.status) filter.status = req.query.status;

  const [questions, total] = await Promise.all([
    Question.find(filter).populate('subject', 'name code').sort('-createdAt').skip(skip).limit(limit),
    Question.countDocuments(filter),
  ]);
  res.json({ success: true, questions, total, page, pages: Math.ceil(total / limit) });
});

// POST /api/questions
exports.createQuestion = asyncHandler(async (req, res) => {
  await assertSubjectAccess(req.user, req.body.subject);
  const data = normalizeQuestion(req.body);
  data.createdBy = req.user._id;
  const question = await Question.create(data);
  logActivity(req.user._id, 'question-created', `Question in subject ${data.subject}`, req.ip);
  res.status(201).json({ success: true, question });
});

// POST /api/questions/generate  { subject, topic?, count?, difficulty?, type? }
// AI-generates questions (saved as pending) and notifies the subject's teachers to approve.
exports.generateQuestions = asyncHandler(async (req, res) => {
  const { subject, topic, count, difficulty, type } = req.body;
  if (!subject) throw new ApiError(400, 'Subject is required');
  await assertSubjectAccess(req.user, subject);
  if (!aiReady()) throw new ApiError(503, 'AI generation is not configured. Add ANTHROPIC_API_KEY in your environment.');

  const subjectDoc = await Subject.findById(subject);
  if (!subjectDoc) throw new ApiError(404, 'Subject not found');

  const n = Math.min(Math.max(parseInt(count, 10) || 5, 1), 20);
  let generated;
  try {
    generated = await aiGenerate({
      subjectName: subjectDoc.name,
      topic: topic ? String(topic).slice(0, 120) : '',
      count: n,
      difficulty: ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'mixed',
      type: ['mcq', 'truefalse', 'fillblank'].includes(type) ? type : 'mixed',
    });
  } catch (err) {
    throw new ApiError(502, `AI generation failed: ${err.message}`);
  }

  const docs = [];
  const errors = [];
  generated.forEach((g, i) => {
    try {
      const data = normalizeQuestion({ ...g, subject, topic: topic || g.topic || 'General' });
      data.createdBy = req.user._id;
      data.status = 'pending';
      data.source = 'ai';
      docs.push(data);
    } catch (e) {
      errors.push(`Item ${i + 1}: ${e.message}`);
    }
  });

  const inserted = docs.length ? await Question.insertMany(docs) : [];

  // Ask the subject's teachers to review
  const teacherIds = (subjectDoc.teachers || []).map(String);
  if (teacherIds.length) {
    notify(teacherIds, {
      title: 'Questions Awaiting Approval',
      message: `${inserted.length} AI-generated question(s) for "${subjectDoc.name}" need your review.`,
      type: 'report',
      link: '#questions',
    });
  }
  logActivity(req.user._id, 'ai-questions-generated', `${inserted.length} for ${subjectDoc.name}`, req.ip);
  res.status(201).json({ success: true, generated: inserted.length, failed: errors.length, errors });
});

// PATCH /api/questions/:id/status  { status: 'approved' | 'rejected' }
exports.setQuestionStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) throw new ApiError(400, 'Invalid status');
  const question = await Question.findById(req.params.id);
  if (!question) throw new ApiError(404, 'Question not found');
  await assertSubjectAccess(req.user, question.subject);
  question.status = status;
  question.approvedBy = req.user._id;
  await question.save();
  logActivity(req.user._id, `question-${status}`, `Question ${question._id}`, req.ip);
  res.json({ success: true, question });
});

// PATCH /api/questions/approve-all?subject=<id>  (approve every pending question in scope)
exports.approveAllPending = asyncHandler(async (req, res) => {
  const subjectId = req.query.subject || req.body.subject;
  const filter = { status: 'pending' };
  if (subjectId) {
    await assertSubjectAccess(req.user, subjectId);
    filter.subject = subjectId;
  } else if (req.user.role === 'teacher') {
    const mySubjects = await Subject.find({ teachers: req.user._id }).distinct('_id');
    filter.subject = { $in: mySubjects };
  }
  const result = await Question.updateMany(filter, { status: 'approved', approvedBy: req.user._id });
  res.json({ success: true, approved: result.modifiedCount });
});

// PUT /api/questions/:id
exports.updateQuestion = asyncHandler(async (req, res) => {
  const question = await Question.findById(req.params.id);
  if (!question) throw new ApiError(404, 'Question not found');
  await assertSubjectAccess(req.user, question.subject);

  const data = normalizeQuestion({ ...question.toObject(), ...req.body, subject: req.body.subject || question.subject });
  if (req.body.subject) await assertSubjectAccess(req.user, req.body.subject);
  Object.assign(question, data);
  await question.save();
  res.json({ success: true, question });
});

// DELETE /api/questions/:id
exports.deleteQuestion = asyncHandler(async (req, res) => {
  const question = await Question.findById(req.params.id);
  if (!question) throw new ApiError(404, 'Question not found');
  await assertSubjectAccess(req.user, question.subject);
  await question.deleteOne();
  res.json({ success: true, message: 'Question deleted' });
});

// POST /api/questions/:id/image  (multipart "image")
exports.uploadQuestionImage = asyncHandler(async (req, res) => {
  if (!cloudinaryReady()) throw new ApiError(503, 'Image uploads are disabled (Cloudinary is not configured)');
  if (!req.file) throw new ApiError(400, 'Image file is required');
  const question = await Question.findById(req.params.id);
  if (!question) throw new ApiError(404, 'Question not found');
  await assertSubjectAccess(req.user, question.subject);
  question.image = await cloudUpload(req.file.buffer, 'quiz-master/questions');
  await question.save();
  res.json({ success: true, image: question.image.url });
});

// POST /api/questions/import  (multipart "file" CSV)  ?subject=<id>
// CSV columns: type,text,optiona,optionb,optionc,optiond,correctanswer,topic,difficulty,marks
exports.importQuestions = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'CSV file is required');
  const subjectId = req.query.subject || req.body.subject;
  if (!subjectId) throw new ApiError(400, 'Target subject is required');
  await assertSubjectAccess(req.user, subjectId);

  const rows = parseCsv(req.file.buffer.toString('utf8'));
  if (!rows.length) throw new ApiError(400, 'CSV file is empty');

  const created = [];
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const options = [r.optiona, r.optionb, r.optionc, r.optiond, r.optione].filter((o) => o && o.trim());
      const data = normalizeQuestion({
        subject: subjectId,
        type: (r.type || 'mcq').toLowerCase().replace(/[^a-z]/g, ''),
        text: r.text || r.question,
        options,
        correctAnswer: r.correctanswer || r.answer,
        topic: r.topic,
        difficulty: (r.difficulty || 'medium').toLowerCase(),
        marks: r.marks,
      });
      data.createdBy = req.user._id;
      created.push(data);
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err.message}`);
    }
  }

  const inserted = created.length ? await Question.insertMany(created) : [];
  logActivity(req.user._id, 'questions-imported', `${inserted.length} questions into subject ${subjectId}`, req.ip);
  res.status(201).json({ success: true, imported: inserted.length, failed: errors.length, errors });
});

// GET /api/questions/export?subject=<id>  -> CSV download
exports.exportQuestions = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.subject) {
    await assertSubjectAccess(req.user, req.query.subject);
    filter.subject = req.query.subject;
  } else if (req.user.role === 'teacher') {
    const mySubjects = await Subject.find({ teachers: req.user._id }).distinct('_id');
    filter.subject = { $in: mySubjects };
  }

  const questions = await Question.find(filter).populate('subject', 'code');
  const csv = toCsv(questions, [
    { label: 'type', value: 'type' },
    { label: 'text', value: 'text' },
    { label: 'optionA', value: (q) => q.options[0] || '' },
    { label: 'optionB', value: (q) => q.options[1] || '' },
    { label: 'optionC', value: (q) => q.options[2] || '' },
    { label: 'optionD', value: (q) => q.options[3] || '' },
    { label: 'correctAnswer', value: 'correctAnswer' },
    { label: 'topic', value: 'topic' },
    { label: 'difficulty', value: 'difficulty' },
    { label: 'marks', value: 'marks' },
    { label: 'subject', value: (q) => q.subject?.code || '' },
  ]);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="questions.csv"');
  res.send(csv);
});
