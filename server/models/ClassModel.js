const mongoose = require('mongoose');

const classSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    level: { type: String, trim: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    academicSession: { type: String, trim: true }, // e.g. 2025/2026
  },
  { timestamps: true }
);

module.exports = mongoose.model('Class', classSchema);
