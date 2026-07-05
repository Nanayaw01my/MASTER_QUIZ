const router = require('express').Router();
const admin = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

// Classes are readable by any authenticated user (needed for quiz forms),
// but only admins can modify them.
router.get('/', protect, admin.listClasses);
router.post('/', protect, authorize('admin'), admin.createClass);
router.put('/:id', protect, authorize('admin'), admin.updateClass);
router.delete('/:id', protect, authorize('admin'), admin.deleteClass);

module.exports = router;
