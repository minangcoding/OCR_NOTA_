import { Router } from 'express';
import { getUsers, createUser, updateUser, deleteUser } from '../controllers/UserController';
import { verifyToken, requireAdmin } from '../middlewares/auth';

const router = Router();

// Apply auth middleware and RBAC (Admin only) to all user routes
router.use(verifyToken);
router.use(requireAdmin);

router.get('/', getUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;
