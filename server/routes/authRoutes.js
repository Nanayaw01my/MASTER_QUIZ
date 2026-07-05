const router = require('express').Router();
const auth = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { uploadImage } = require('../middleware/upload');

router.post('/login', auth.login);
router.post('/register', auth.register);
router.get('/classes', auth.publicClasses);
router.post('/refresh', auth.refresh);
router.post('/logout', auth.logout);
router.post('/forgot-password', auth.forgotPassword);
router.post('/reset-password/:token', auth.resetPassword);

router.get('/me', protect, auth.me);
router.put('/profile', protect, auth.updateProfile);
router.put('/profile/picture', protect, uploadImage.single('image'), auth.updateProfilePicture);
router.put('/password', protect, auth.changePassword);

module.exports = router;
