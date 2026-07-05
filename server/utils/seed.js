/**
 * Seed script: creates the default administrator account.
 * Run with `npm run seed` after configuring .env.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const email = (process.env.ADMIN_EMAIL || 'admin@quizmaster.com').toLowerCase();

    const existing = await User.findOne({ email });
    if (existing) {
      console.log(`Admin already exists: ${email}`);
    } else {
      await User.create({
        name: process.env.ADMIN_NAME || 'System Administrator',
        email,
        password: process.env.ADMIN_PASSWORD || 'Admin@1234',
        role: 'admin',
      });
      console.log(`Admin created: ${email}`);
      console.log('IMPORTANT: change the default password after first login.');
    }
  } catch (err) {
    console.error(`Seed failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
