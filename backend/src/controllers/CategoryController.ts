import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { sendSuccess, sendError } from '../utils/responseHandler';

export const getCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { created_at: 'desc' }
    });
    sendSuccess(res, categories, 'Categories retrieved successfully');
  } catch (error) {
    console.error('Error getting categories:', error);
    sendError(res, 500, 'Internal server error');
  }
};

export const createCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, code, type, is_active } = req.body;

    if (!name || !code) {
      sendError(res, 400, 'Name and code are required');
      return;
    }

    // Check if code already exists
    const existingCode = await prisma.category.findFirst({ where: { code } });
    if (existingCode) {
      sendError(res, 400, 'Category code already exists');
      return;
    }

    const newCategory = await prisma.category.create({
      data: {
        name,
        code,
        type: type ?? "COA Project",
        is_active: is_active ?? true,
      }
    });

    sendSuccess(res, newCategory, 'Category created successfully');
  } catch (error) {
    console.error('Error creating category:', error);
    sendError(res, 500, 'Internal server error');
  }
};

export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { name, code, type, is_active } = req.body;

    // Check if updating code to an existing one
    if (code) {
      const existingCode = await prisma.category.findFirst({
        where: { 
          code,
          NOT: { id }
        }
      });
      if (existingCode) {
        sendError(res, 400, 'Category code already exists');
        return;
      }
    }

    const updatedCategory = await prisma.category.update({
      where: { id },
      data: { name, code, type, is_active }
    });

    sendSuccess(res, updatedCategory, 'Category updated successfully');
  } catch (error: any) {
    console.error('Error updating category:', error);
    if (error.code === 'P2025') {
      sendError(res, 404, 'Category not found');
    } else {
      sendError(res, 500, 'Internal server error');
    }
  }
};

export const deleteCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    
    await prisma.category.delete({
      where: { id }
    });

    sendSuccess(res, null, 'Category deleted successfully');
  } catch (error: any) {
    console.error('Error deleting category:', error);
    if (error.code === 'P2025') {
      sendError(res, 404, 'Category not found');
    } else if (error.code === 'P2003') {
      // Prisma Foreign Key Constraint failed (Category is used in Notes)
      sendError(res, 400, 'Cannot delete category because it is already used in one or more receipts');
    } else {
      sendError(res, 500, 'Internal server error');
    }
  }
};
