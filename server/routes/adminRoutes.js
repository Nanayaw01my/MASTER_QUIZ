const router = require('express').Router();
const admin = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('admin'));

router.get('/dashboard', admin.dashboard);

router.get('/users', admin.listUsers);
router.post('/users', admin.createUser);
router.put('/users/:id', admin.updateUser);
router.patch('/users/:id/status', admin.setUserStatus);
router.patch('/users/:id/reset-password', admin.adminResetPassword);
router.delete('/users/:id', admin.deleteUser);

router.get('/departments', admin.listDepartments);
router.post('/departments', admin.createDepartment);
router.put('/departments/:id', admin.updateDepartment);
router.delete('/departments/:id', admin.deleteDepartment);

router.get('/logs', admin.listLogs);

module.exports = router;
