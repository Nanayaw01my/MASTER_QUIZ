const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Quiz title is required'], trim: true },
    description: { type: String, trim: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    classRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    duration: { type: Number, required: true, min: 1 }, // minutes
    questionCount: { type: Number, default: 0 }, // 0 = use all questions
    randomizeQuestions: { type: Boolean, default: true },
    randomizeOptions: { type: Boolean, default: true },
    passMark: { type: Number, default: 50, min: 0, max: 100 }, // percentage
    maxAttempts: { type: Number, default: 1, min: 1 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    settings: {
      warningLimit: { type: Number, default: 3, min: 1 }, // proctoring warnings before auto-submit
      allowResume: { type: Boolean, default: false }, // resume after network interruption
      showReview: { type: Boolean, default: true }, // review answers before submission
      requireProctoring: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

quizSchema.index({ subject: 1, classRef: 1, status: 1 });

module.exports = mongoose.model('Quiz', quizSchema);
