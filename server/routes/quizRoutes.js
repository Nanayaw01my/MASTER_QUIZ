const router = require('express').Router();
const quizzes = require('../controllers/quizController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', quizzes.listQuizzes);
router.get('/:id', quizzes.getQuiz);
router.post('/', authorize('admin', 'teacher'), quizzes.createQuiz);
router.put('/:id', authorize('admin', 'teacher'), quizzes.updateQuiz);
router.patch('/:id/publish', authorize('admin', 'teacher'), quizzes.publishQuiz);
router.delete('/:id', authorize('admin', 'teacher'), quizzes.deleteQuiz);

module.exports = router;
