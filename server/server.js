require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const morgan = require('morgan');

const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
connectDB().then(() => require('./utils/ensureAdmin')());

// Render/Railway run behind a reverse proxy
app.set('trust proxy', 1);

// ------------------------------------------------------------ Security
app.use(
  helmet({
    // CSP is relaxed so the client can load face-api.js / TensorFlow.js from CDNs
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(
  cors({
    origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : true,
    credentials: true,
  })
);
app.use(express.json({ limit: '8mb' })); // allows base64 webcam captures
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(mongoSanitize()); // strips $ and . from keys -> blocks NoSQL injection
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// Rate limiting
app.use(
  '/api',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false })
);
app.use(
  ['/api/auth/login', '/api/auth/forgot-password', '/api/auth/reset-password'],
  rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { success: false, message: 'Too many attempts, try again later' } })
);

// ------------------------------------------------------------ API routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/classes', require('./routes/classRoutes'));
app.use('/api/subjects', require('./routes/subjectRoutes'));
app.use('/api/questions', require('./routes/questionRoutes'));
app.use('/api/quizzes', require('./routes/quizRoutes'));
app.use('/api/attempts', require('./routes/attemptRoutes'));
app.use('/api/violations', require('./routes/violationRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/announcements', require('./routes/announcementRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));

app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok', time: new Date().toISOString() }));

// ------------------------------------------------------------ Static client
const clientDir = path.join(__dirname, '..', 'client');
app.use(express.static(clientDir));

// API 404 + error handling
app.use('/api', notFound);
app.use(errorHandler);

// Client-side fallback pages
app.use((req, res) => res.status(404).sendFile(path.join(clientDir, '404.html')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Quiz Master server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`));

module.exports = app;
