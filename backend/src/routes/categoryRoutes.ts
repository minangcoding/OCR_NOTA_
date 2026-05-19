import { Router } from 'express';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../controllers/CategoryController';
import { verifyToken, requireAdmin } from '../middlewares/auth';

const router = Router();

// Apply auth middleware
router.use(verifyToken);

router.get('/', getCategories);
router.post('/', requireAdmin, createCategory);
router.put('/:id', requireAdmin, updateCategory);
router.delete('/:id', requireAdmin, deleteCategory);

export default router;
