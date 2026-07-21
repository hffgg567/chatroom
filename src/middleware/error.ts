import { Context, Next } from 'hono';
import type { Env } from '../types';

export async function errorHandler(c: Context<{ Bindings: Env }>, err: Error, next: Next) {
  console.error('Error:', err);
  
  // Hono 的错误处理
  if ('status' in err) {
    return c.json({
      error: err.message || 'Request failed',
    }, err.status as number);
  }
  
  // 未知错误
  return c.json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  }, 500);
}

// 自定义错误类
export class HTTPError extends Error {
  constructor(
    message: string,
    public status: number = 400,
    public code?: string
  ) {
    super(message);
    this.name = 'HTTPError';
  }
}

export class NotFoundError extends HTTPError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends HTTPError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends HTTPError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class BadRequestError extends HTTPError {
  constructor(message: string = 'Bad request') {
    super(message, 400, 'BAD_REQUEST');
  }
}
