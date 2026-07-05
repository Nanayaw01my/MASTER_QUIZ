const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    topic: { type: String, trim: true, default: 'General' },
    type: { type: String, enum: ['mcq', 'truefalse', 'fillblank'], required: true },
    text: { type: String, required: [true, 'Question text is required'], trim: true },
    image: { url: String, publicId: String },
    // For mcq: list of option strings. For truefalse it is fixed to ['True','False'].
    options: {
      type: [String],
      validate: {
        validator: function (v) {
          if (this.type === 'mcq') return Array.isArray(v) && v.length >= 2;
          return true;
        },
        message: 'Multiple choice questions need at least 2 options',
      },
    },
    // Correct answer stored as text (option value / True / False / expected fill-in text)
    correctAnswer: { type: String, required: [true, 'Correct answer is required'], trim: true },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    marks: { type: Number, default: 1, min: 0.5 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Approval workflow: manual questions are approved immediately; AI-generated
    // questions start as 'pending' and must be approved by a teacher/admin.
    status: { type: String, enum: ['approved', 'pending', 'rejected'], default: 'approved' },
    source: { type: String, enum: ['manual', 'ai'], default: 'manual' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

questionSchema.index({ subject: 1, topic: 1, difficulty: 1 });
questionSchema.index({ text: 'text' });

module.exports = mongoose.model('Question', questionSchema);
