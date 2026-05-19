import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma';
import { sendSuccess, sendError } from '../utils/responseHandler';

export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        is_active: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' }
    });
    sendSuccess(res, users, 'Users retrieved successfully');
  } catch (error) {
    console.error('Error getting users:', error);
    sendError(res, 500, 'Internal server error');
  }
};

export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, role, is_active } = req.body;

    if (!name || !email || !password || !role) {
      sendError(res, 400, 'All fields are required');
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      sendError(res, 400, 'Email already exists');
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        is_active: is_active ?? true,
      },
      select: { id: true, name: true, email: true, role: true, is_active: true }
    });

    sendSuccess(res, newUser, 'User created successfully');
  } catch (error) {
    console.error('Error creating user:', error);
    sendError(res, 500, 'Internal server error');
  }
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { name, email, role, password, is_active } = req.body;

    const dataToUpdate: any = { name, email, role };
    if (is_active !== undefined) {
      dataToUpdate.is_active = is_active;
    }
    if (password) {
      dataToUpdate.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: dataToUpdate,
      select: { id: true, name: true, email: true, role: true, is_active: true }
    });

    sendSuccess(res, updatedUser, 'User updated successfully');
  } catch (error: any) {
    console.error('Error updating user:', error);
    if (error.code === 'P2025') {
      sendError(res, 404, 'User not found');
    } else {
      sendError(res, 500, 'Internal server error');
    }
  }
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    
    await prisma.user.delete({
      where: { id }
    });

    sendSuccess(res, null, 'User deleted successfully');
  } catch (error: any) {
    console.error('Error deleting user:', error);
    if (error.code === 'P2025') {
      sendError(res, 404, 'User not found');
    } else if (error.code === 'P2003') {
      sendError(res, 400, 'Cannot delete user because they are linked to one or more receipts');
    } else {
      sendError(res, 500, 'Internal server error');
    }
  }
};
