import { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import type { Env, User, JWTPayload } from '../types';

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized: No token provided' }, 401);
  }
  
  const token = authHeader.slice(7);
  
  try {
    const payload = await verify(token, c.env.JWT_SECRET) as JWTPayload;
    
    // 检查用户是否存在且状态正常
    const db = c.env.DB;
    const user = await db
      .prepare('SELECT * FROM users WHERE github_id = ? AND status = ?')
      .bind(payload.sub, 'active')
      .first<User>();
    
    if (!user) {
      return c.json({ error: 'Unauthorized: User not found or banned' }, 401);
    }
    
    // 检查是否被禁言
    if (user.mute_until && user.mute_until > Date.now()) {
      return c.json({ 
        error: 'You are muted', 
        mute_until: user.mute_until 
      }, 403);
    }
    
    // 将用户信息存入 context
    c.set('user', user);
    c.set('userId', user.github_id);
    
    await next();
  } catch (err) {
    if (err instanceof Error && err.name === 'JwtExpired') {
      return c.json({ error: 'Token expired' }, 401);
    }
    return c.json({ error: 'Invalid token' }, 401);
  }
}

// 可选认证中间件 (不强制要求登录)
export async function optionalAuthMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    await next();
    return;
  }
  
  const token = authHeader.slice(7);
  
  try {
    const payload = await verify(token, c.env.JWT_SECRET) as JWTPayload;
    const db = c.env.DB;
    
    const user = await db
      .prepare('SELECT * FROM users WHERE github_id = ? AND status = ?')
      .bind(payload.sub, 'active')
      .first<User>();
    
    if (user) {
      c.set('user', user);
      c.set('userId', user.github_id);
    }
  } catch {
    // 忽略错误，继续执行
  }
  
  await next();
}

// 管理员中间件
export async function adminMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const user = c.get('user') as User | undefined;
  
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  if (user.role !== 'admin') {
    return c.json({ error: 'Forbidden: Admin access required' }, 403);
  }
  
  await next();
}
