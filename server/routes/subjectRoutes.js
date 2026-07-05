const router = require('express').Router();
const subjects = require('../controllers/subjectController');
const { protect, authorize } = require('../middleware/auth');

router.get('/', protect, subjects.listSubjects);
router.post('/', protect, authorize('admin'), subjects.createSubject);
router.put('/:id', protect, authorize('admin'), subjects.updateSubject);
router.delete('/:id', protect, authorize('admin'), subjects.deleteSubject);

module.exports = router;
