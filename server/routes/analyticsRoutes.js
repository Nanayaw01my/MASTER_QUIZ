const router = require('express').Router();
const analytics = require('../controllers/analyticsController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/overview', analytics.overview);
router.get('/subjects', analytics.subjectPerformance);
router.get('/monthly', analytics.monthly);
router.get('/top-students', authorize('admin', 'teacher'), analytics.topStudents);

module.exports = router;
