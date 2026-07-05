const router = require('express').Router();
const ctrl = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', ctrl.listAnnouncements);
router.post('/', authorize('admin'), ctrl.createAnnouncement);
router.delete('/:id', authorize('admin'), ctrl.deleteAnnouncement);

module.exports = router;
