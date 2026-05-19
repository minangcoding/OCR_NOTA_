import { Response } from 'express';

export const sendSuccess = (res: Response, data: any, message = 'Success', meta = {}) => {
  res.status(200).json({
    status: 'success',
    code: 200,
    message,
    data,
    meta,
  });
};

export const sendError = (res: Response, code: number, message: string) => {
  res.status(code).json({
    status: 'error',
    code,
    message,
  });
};
