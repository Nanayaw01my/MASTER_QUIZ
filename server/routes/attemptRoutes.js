const router = require('express').Router();
const attempts = require('../controllers/attemptController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// Results (must come before parameterized routes)
router.get('/results/export/csv', authorize('admin', 'teacher'), attempts.exportResults);
router.get('/results/:id', attempts.getResult);
router.get('/results', attempts.listResults);
router.get('/leaderboard/:quizId', attempts.leaderboard);

// Exam flow (students only)
router.post('/start', authorize('student'), attempts.startAttempt);
router.patch('/:id/answer', authorize('student'), attempts.saveAnswer);
router.post('/:id/submit', authorize('student'), attempts.submitAttempt);

module.exports = router;
