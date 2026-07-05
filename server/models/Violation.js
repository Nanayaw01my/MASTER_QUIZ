const mongoose = require('mongoose');

const VIOLATION_TYPES = [
  'no-face',
  'multiple-faces',
  'phone-detected',
  'tab-switch',
  'window-blur',
  'fullscreen-exit',
  'camera-disconnected',
  'camera-blocked',
  'face-outside-circle',
  'face-verification-failed',
];

const violationSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
    attempt: { type: mongoose.Schema.Types.ObjectId, ref: 'Attempt' }, // absent for pre-start verification failures
    type: { type: String, enum: VIOLATION_TYPES, required: true },
    details: { type: String, trim: true },
    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

violationSchema.index({ quiz: 1, student: 1 });
violationSchema.statics.TYPES = VIOLATION_TYPES;

module.exports = mongoose.model('Violation', violationSchema);
