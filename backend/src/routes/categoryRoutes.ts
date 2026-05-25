import { Router } from "express";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/CategoryController";
import { verifyToken, requireAdmin } from "../middlewares/auth";

const router = Router();

// Apply auth middleware
router.use(verifyToken);

router.get("/", getCategories);
router.post("/", createCategory);
router.put("/:id", updateCategory);
router.delete("/:id", deleteCategory);

export default router;
