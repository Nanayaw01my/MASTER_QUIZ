const User = require('../models/User');

/**
 * Auto-seed: create the default admin account on startup if no user with
 * ADMIN_EMAIL exists. Lets deployments without shell access (e.g. Render
 * free tier) bootstrap themselves from environment variables alone.
 */
module.exports = async function ensureAdmin() {
  try {
    const email = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) return;

    const existing = await User.findOne({ email });
    if (existing) return;

    await User.create({
      name: process.env.ADMIN_NAME || 'System Administrator',
      email,
      password,
      role: 'admin',
    });
    console.log(`Default admin account created: ${email}`);
  } catch (err) {
    console.error(`ensureAdmin failed: ${err.message}`);
  }
};
