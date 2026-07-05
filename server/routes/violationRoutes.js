const router = require('express').Router();
const violations = require('../controllers/violationController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.post('/', authorize('student'), violations.reportViolation);
router.get('/', authorize('admin', 'teacher'), violations.listViolations);

module.exports = router;
