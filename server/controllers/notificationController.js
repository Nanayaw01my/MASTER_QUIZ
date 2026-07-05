const Notification = require('../models/Notification');
const Announcement = require('../models/Announcement');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { notify, paginate, logActivity } = require('../utils/helpers');

// GET /api/notifications
exports.listNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req, 15);
  const [notifications, total, unread] = await Promise.all([
    Notification.find({ user: req.user._id }).sort('-createdAt').skip(skip).limit(limit),
    Notification.countDocuments({ user: req.user._id }),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);
  res.json({ success: true, notifications, total, unread, page, pages: Math.ceil(total / limit) });
});

// PATCH /api/notifications/:id/read
exports.markRead = asyncHandler(async (req, res) => {
  const n = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { read: true },
    { new: true }
  );
  if (!n) throw new ApiError(404, 'Notification not found');
  res.json({ success: true });
});

// PATCH /api/notifications/read-all
exports.markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  res.json({ success: true });
});

// ---------------------------------------------------------------- Announcements

// GET /api/announcements
exports.listAnnouncements = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req, 10);
  const audience =
    req.user.role === 'admin' ? {} : { audience: { $in: ['all', `${req.user.role}s`] } };
  const [announcements, total] = await Promise.all([
    Announcement.find(audience).populate('createdBy', 'name').sort('-createdAt').skip(skip).limit(limit),
    Announcement.countDocuments(audience),
  ]);
  res.json({ success: true, announcements, total, page, pages: Math.ceil(total / limit) });
});

// POST /api/announcements  (admin)
exports.createAnnouncement = asyncHandler(async (req, res) => {
  const { title, body, audience } = req.body;
  const announcement = await Announcement.create({ title, body, audience, createdBy: req.user._id });

  const roleFilter =
    audience === 'teachers' ? { role: 'teacher' } : audience === 'students' ? { role: 'student' } : { role: { $ne: 'admin' } };
  const users = await User.find({ ...roleFilter, status: 'active' }).distinct('_id');
  notify(users, { title: `Announcement: ${title}`, message: String(body).slice(0, 200), type: 'announcement' });

  logActivity(req.user._id, 'announcement-created', title, req.ip);
  res.status(201).json({ success: true, announcement });
});

// DELETE /api/announcements/:id  (admin)
exports.deleteAnnouncement = asyncHandler(async (req, res) => {
  const a = await Announcement.findByIdAndDelete(req.params.id);
  if (!a) throw new ApiError(404, 'Announcement not found');
  res.json({ success: true, message: 'Announcement deleted' });
});
