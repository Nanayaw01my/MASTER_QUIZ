const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 100 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: { type: String, required: [true, 'Password is required'], minlength: 6, select: false },
    role: { type: String, enum: ['admin', 'teacher', 'student'], default: 'student' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    profileImage: { url: String, publicId: String },
    // Reference face embedding captured during first verification (used for face matching)
    faceDescriptor: { type: [Number], default: undefined },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    classRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' }, // students only
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }], // teachers only
    regNumber: { type: String, trim: true }, // student/staff ID
    phone: { type: String, trim: true },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    lastLogin: Date,
  },
  { timestamps: true }
);

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

userSchema.methods.getResetPasswordToken = function () {
  const token = crypto.randomBytes(20).toString('hex');
  this.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
  this.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 minutes
  return token;
};

module.exports = mongoose.model('User', userSchema);
