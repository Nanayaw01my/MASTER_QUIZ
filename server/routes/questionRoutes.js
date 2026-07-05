const router = require('express').Router();
const questions = require('../controllers/questionController');
const { protect, authorize } = require('../middleware/auth');
const { uploadImage, uploadCsv } = require('../middleware/upload');

router.use(protect, authorize('admin', 'teacher'));

router.get('/', questions.listQuestions);
router.get('/export', questions.exportQuestions);
router.post('/', questions.createQuestion);
router.post('/import', uploadCsv.single('file'), questions.importQuestions);
router.post('/:id/image', uploadImage.single('image'), questions.uploadQuestionImage);
router.put('/:id', questions.updateQuestion);
router.delete('/:id', questions.deleteQuestion);

module.exports = router;
