import { Router, Request, Response } from "express";
import {
  getReportSummary,
  getTransactions,
  exportExcel,
  exportPdf,
  getDashboardStats,
} from "../controllers/ReportController";
import { verifyToken } from "../middlewares/auth";

const router = Router();

// All report endpoints require authentication (any role)
router.use(verifyToken);

router.get("/summary", (req: Request, res: Response) => {
  void getReportSummary(req, res);
});

router.get("/dashboard", (req: Request, res: Response) => {
  void getDashboardStats(req, res);
});

router.get("/transactions", (req: Request, res: Response) => {
  void getTransactions(req, res);
});

router.get("/export/excel", (req: Request, res: Response) => {
  void exportExcel(req, res);
});

router.get("/export/pdf", (req: Request, res: Response) => {
  void exportPdf(req, res);
});

export default router;
