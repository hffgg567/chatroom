import { Context, Next } from 'hono';
import type { Env } from '../types';

// 简单的内存存储用于限流 (生产环境建议使用 KV)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

interface RateLimitConfig {
  windowMs: number;  // 时间窗口 (毫秒)
  maxRequests: number; // 最大请求数
}

const defaultConfig: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 分钟
  maxRequests: 100,
};

export function rateLimit(config: Partial<RateLimitConfig> = {}) {
  const { windowMs, maxRequests } = { ...defaultConfig, ...config };
  
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    // 使用 IP + 用户 ID 组合作为 key
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const userId = c.get('userId') || 'anonymous';
    const key = `${ip}:${userId}`;
    
    const now = Date.now();
    const record = rateLimitStore.get(key);
    
    if (!record || now > record.resetAt) {
      // 新窗口
      rateLimitStore.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
    } else {
      record.count++;
      
      if (record.count > maxRequests) {
        const retryAfter = Math.ceil((record.resetAt - now) / 1000);
        c.header('Retry-After', String(retryAfter));
        c.header('X-RateLimit-Limit', String(maxRequests));
        c.header('X-RateLimit-Remaining', '0');
        c.header('X-RateLimit-Reset', String(record.resetAt));
        
        return c.json({
          error: 'Rate limit exceeded',
          retryAfter,
        }, 429);
      }
      
      rateLimitStore.set(key, record);
    }
    
    // 设置响应头
    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - record.count)));
    c.header('X-RateLimit-Reset', String(record.resetAt));
    
    await next();
  };
}

// 更严格的限流 (用于敏感操作)
export function strictRateLimit(maxRequests: number = 5, windowMs: number = 60 * 1000) {
  return rateLimit({ maxRequests, windowMs });
}
