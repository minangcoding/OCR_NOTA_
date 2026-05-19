import { Router } from 'express';
import { getReportSummary, getTransactions, exportExcel, exportPdf, getDashboardStats } from '../controllers/ReportController';
import { verifyToken } from '../middlewares/auth';

const router = Router();

// All report endpoints require authentication (any role)
router.use(verifyToken);

router.get('/summary', getReportSummary);
router.get('/dashboard', getDashboardStats);
router.get('/transactions', getTransactions);
router.get('/export/excel', exportExcel);
router.get('/export/pdf', exportPdf);

export default router;
