import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { sendError } from '../utils/responseHandler';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

export const verifyToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(res, 401, 'Unauthorized: No token provided');
      return;
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      sendError(res, 500, 'JWT secret is not configured');
      return;
    }

    const decoded = jwt.verify(token, secret) as AuthRequest['user'];
    req.user = decoded;

    next();
  } catch (error) {
    sendError(res, 401, 'Unauthorized: Invalid token');
    return;
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'admin') {
    sendError(res, 403, 'Forbidden: Admin access required');
    return;
  }
  next();
};
