const ActivityLog = require('../models/ActivityLog');
const Notification = require('../models/Notification');

/** Convert a percentage into a letter grade. */
const gradeFor = (pct) => {
  if (pct >= 70) return 'A';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 40) return 'D';
  return 'F';
};

/** Fisher-Yates shuffle (returns a new array). */
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Fire-and-forget audit log entry. */
const logActivity = (userId, action, details = '', ip = '') => {
  ActivityLog.create({ user: userId, action, details, ip }).catch((err) =>
    console.error(`Activity log failed: ${err.message}`)
  );
};

/** Create notifications for one or many users (fire-and-forget). */
const notify = (userIds, { title, message, type = 'system', link = '' }) => {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  if (!ids.length) return;
  const docs = ids.map((user) => ({ user, title, message, type, link }));
  Notification.insertMany(docs).catch((err) => console.error(`Notification failed: ${err.message}`));
};

/** Parse pagination query params with sane bounds. */
const paginate = (req, defaultLimit = 10) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || defaultLimit, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

/** Escape a string for safe use inside a RegExp. */
const escapeRegex = (s = '') => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { gradeFor, shuffle, logActivity, notify, paginate, escapeRegex };
