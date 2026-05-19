import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { sendSuccess, sendError } from '../utils/responseHandler';

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const notifications = await prisma.notification.findMany({
      orderBy: { created_at: 'desc' },
      take: 20
    });
    
    sendSuccess(res, notifications, 'Notifications retrieved');
  } catch (error) {
    console.error('Error getting notifications:', error);
    sendError(res, 500, 'Internal server error');
  }
};

export const markNotificationsAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.notification.updateMany({
      where: { is_read: false },
      data: { is_read: true }
    });
    
    sendSuccess(res, null, 'Notifications marked as read');
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    sendError(res, 500, 'Internal server error');
  }
};
