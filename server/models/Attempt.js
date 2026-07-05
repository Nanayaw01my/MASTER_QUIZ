const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema(
  {
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    answer: { type: String, default: '' },
    correct: { type: Boolean },
    marksAwarded: { type: Number, default: 0 },
  },
  { _id: false }
);

const attemptSchema = new mongoose.Schema(
  {
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Snapshot of the question order (and shuffled options) served to this student
    servedQuestions: [
      {
        question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
        options: [String],
        _id: false,
      },
    ],
    answers: [answerSchema],
    status: { type: String, enum: ['in-progress', 'submitted', 'auto-submitted'], default: 'in-progress' },
    submitReason: { type: String, default: '' }, // e.g. 'completed', 'tab-switch', 'camera-lost'
    score: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    grade: { type: String, default: '-' },
    passed: { type: Boolean, default: false },
    timeTaken: { type: Number, default: 0 }, // seconds
    startedAt: { type: Date, default: Date.now },
    endsAt: { type: Date, required: true },
    submittedAt: Date,
    warningsCount: { type: Number, default: 0 },
    faceImageStart: { url: String, publicId: String },
    faceImageEnd: { url: String, publicId: String },
  },
  { timestamps: true }
);

attemptSchema.index({ quiz: 1, student: 1 });
attemptSchema.index({ student: 1, status: 1 });

module.exports = mongoose.model('Attempt', attemptSchema);
