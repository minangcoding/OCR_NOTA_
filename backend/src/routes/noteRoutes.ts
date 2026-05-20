import { Router } from 'express';
import { uploadNoteImage, uploadNoteImageAsync, getUploadJobStatus, createNote, getNotes, getNoteById, updateNote, deleteNote, getNoteAuditTrail, getAllAuditTrails, restoreNote, permanentDeleteNote } from '../controllers/NoteController';
import { verifyToken, requireAdmin } from '../middlewares/auth';
import { upload } from '../middlewares/upload';

const router = Router();

// Apply auth middleware
router.use(verifyToken);

// Upload endpoint using multer. Single file named 'image'
router.post('/upload', (req, res, next) => {
  console.log('>>> [BACKEND] Request hitting /upload route (Before Multer parsing...)');
  next();
}, upload.single('image'), uploadNoteImage);

router.post('/upload/async', (req, res, next) => {
  console.log('>>> [BACKEND] Request hitting async /upload route (Before Multer parsing...)');
  next();
}, upload.single('image'), uploadNoteImageAsync);

router.get('/upload/jobs/:jobId', getUploadJobStatus);

// Note operations
router.get('/', getNotes);
router.post('/', createNote);
// Audit Trail
router.get('/versions/all', getAllAuditTrails);
router.get('/:id', getNoteById);
router.patch('/:id', requireAdmin, updateNote);
router.delete('/:id', requireAdmin, deleteNote);
router.get('/:id/versions', getNoteAuditTrail);
router.put('/:id/restore', requireAdmin, restoreNote);
router.delete('/:id/permanent', requireAdmin, permanentDeleteNote);

export default router;
