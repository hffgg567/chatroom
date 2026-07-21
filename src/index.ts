import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from 'hono/cloudflare-workers';

import { authRoutes } from './routes/auth';
import { channelRoutes } from './routes/channels';
import { messageRoutes } from './routes/messages';
import { fileRoutes } from './routes/files';
import { adminRoutes } from './routes/admin';
import { userRoutes } from './routes/users';
import { announcementRoutes } from './routes/announcements';

import { errorHandler } from './middleware/error';
import { authMiddleware } from './middleware/auth';

import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// 全局中间件
app.use('*', logger());
app.use('*', cors({
  origin: ['*'],
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposeHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400,
}));

// 健康检查
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// API 路由
app.route('/api/auth', authRoutes);
app.route('/api/channels', channelRoutes);
app.route('/api/messages', messageRoutes);
app.route('/api/files', fileRoutes);
app.route('/api/users', userRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/announcements', announcementRoutes);

// 公开公告列表 (不需要认证)
app.get('/api/public/announcements', async (c) => {
  const db = c.env.DB;
  const announcements = await db
    .prepare(`
      SELECT a.*, u.username as author_name, u.avatar_url as author_avatar
      FROM announcements a
      LEFT JOIN users u ON a.author_id = u.github_id
      ORDER BY a.pinned DESC, a.created_at DESC
      LIMIT 20
    `)
    .all();
  return c.json(announcements);
});

// 需要认证的路由组
const protectedApp = new Hono<{ Bindings: Env }>();
protectedApp.use('/*', authMiddleware);

// 获取当前用户信息
protectedApp.get('/api/me', async (c) => {
  const user = c.get('user');
  return c.json(user);
});

// 404 处理
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

// 错误处理
app.onError(errorHandler);

export default app;
