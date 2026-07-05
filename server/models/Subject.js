const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    classes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
    teachers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    description: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Subject', subjectSchema);
