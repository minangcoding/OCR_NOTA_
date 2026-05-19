import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import { sendSuccess, sendError } from '../utils/responseHandler';

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      sendError(res, 400, 'Email and password are required');
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      sendError(res, 401, 'Invalid credentials');
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      sendError(res, 401, 'Invalid credentials');
      return;
    }

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_untuk_rms_admin_2026';
    const token = jwt.sign(payload, secret, { expiresIn: '1d' });

    sendSuccess(res, { token, user: payload }, 'Login successful');
  } catch (error: any) {
    console.error('Login error:', error);
    sendError(res, 500, 'Internal server error');
  }
};
