import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env, User } from '../types';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { clearChannelMessages } from '../services/storage';

const adminRoutes = new Hono<{ Bindings: Env }>();

// 所有管理路由都需要管理员权限
adminRoutes.use('/*', authMiddleware);
adminRoutes.use('/*', adminMiddleware);

// ===== 用户管理 =====

// 获取用户列表
adminRoutes.get('/users', async (c) => {
  const query = c.req.query();
  const page = parseInt(query.page) || 1;
  const limit = Math.min(parseInt(query.limit) || 50, 100);
  const offset = (page - 1) * limit;
  const search = query.search || '';
  const status = query.status;
  
  const db = c.env.DB;
  
  let sql = 'SELECT id, github_id, username, display_name, avatar_url, role, status, mute_until, created_at FROM users';
  const bindings: unknown[] = [];
  
  if (search) {
    sql += ' WHERE (username LIKE ? OR display_name LIKE ?)';
    bindings.push(`%${search}%`, `%${search}%`);
  }
  
  if (status) {
    sql += search ? ' AND status = ?' : ' WHERE status = ?';
    bindings.push(status);
  }
  
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  bindings.push(limit, offset);
  
  const users = await db.prepare(sql).bind(...bindings).all();
  
  // 获取总数
  let countSql = 'SELECT COUNT(*) as count FROM users';
  const countBindings: unknown[] = [];
  
  if (search) {
    countSql += ' WHERE (username LIKE ? OR display_name LIKE ?)';
    countBindings.push(`%${search}%`, `%${search}%`);
  }
  
  if (status) {
    countSql += search ? ' AND status = ?' : ' WHERE status = ?';
    countBindings.push(status);
  }
  
  const count = await db.prepare(countSql).bind(...countBindings).first<{ count: number }>();
  
  return c.json({
    users: users.results || [],
    total: count?.count || 0,
    page,
    limit,
    pages: Math.ceil((count?.count || 0) / limit),
  });
});

// 封禁用户
adminRoutes.post('/users/:id/ban', async (c) => {
  const targetId = c.req.param('id');
  const admin = c.get('user') as User;
  const db = c.env.DB;
  
  const user = await db
    .prepare('SELECT * FROM users WHERE github_id = ?')
    .bind(parseInt(targetId))
    .first<User>();
  
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }
  
  if (user.role === 'admin') {
    return c.json({ error: 'Cannot ban an admin' }, 403);
  }
  
  const { reason } = await c.req.json().catch(() => ({ reason: '' }));
  
  await db
    .prepare('UPDATE users SET status = ?, updated_at = ? WHERE github_id = ?')
    .bind('banned', Math.floor(Date.now() / 1000), parseInt(targetId))
    .run();
  
  // 审计日志
  await logAction(db, admin.github_id, admin.username, 'user_ban', 'user', targetId, { reason });
  
  return c.json({ success: true, message: 'User banned' });
});

// 解封用户
adminRoutes.post('/users/:id/unban', async (c) => {
  const targetId = c.req.param('id');
  const admin = c.get('user') as User;
  const db = c.env.DB;
  
  await db
    .prepare('UPDATE users SET status = ?, updated_at = ? WHERE github_id = ?')
    .bind('active', Math.floor(Date.now() / 1000), parseInt(targetId))
    .run();
  
  await logAction(db, admin.github_id, admin.username, 'user_unban', 'user', targetId, {});
  
  return c.json({ success: true, message: 'User unbanned' });
});

// 禁言用户
adminRoutes.post('/users/:id/mute', async (c) => {
  const targetId = c.req.param('id');
  const admin = c.get('user') as User;
  const db = c.env.DB;
  
  const { duration } = await c.req.json(); // 毫秒
  
  if (!duration || duration < 0) {
    return c.json({ error: 'Invalid duration' }, 400);
  }
  
  const muteUntil = Date.now() + duration;
  
  await db
    .prepare('UPDATE users SET mute_until = ?, updated_at = ? WHERE github_id = ?')
    .bind(muteUntil, Math.floor(Date.now() / 1000), parseInt(targetId))
    .run();
  
  await logAction(db, admin.github_id, admin.username, 'user_mute', 'user', targetId, { 
    duration,
    muteUntil,
  });
  
  return c.json({ success: true, mute_until: muteUntil });
});

// 解除禁言
adminRoutes.post('/users/:id/unmute', async (c) => {
  const targetId = c.req.param('id');
  const admin = c.get('user') as User;
  const db = c.env.DB;
  
  await db
    .prepare('UPDATE users SET mute_until = NULL, updated_at = ? WHERE github_id = ?')
    .bind(Math.floor(Date.now() / 1000), parseInt(targetId))
    .run();
  
  await logAction(db, admin.github_id, admin.username, 'user_unmute', 'user', targetId, {});
  
  return c.json({ success: true, message: 'User unmuted' });
});

// ===== 频道管理 =====

// 获取所有频道
adminRoutes.get('/channels', async (c) => {
  const db = c.env.DB;
  
  const channels = await db
    .prepare(`
      SELECT c.*, 
             u.username as owner_name,
             (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as member_count
      FROM channels c
      LEFT JOIN users u ON c.owner_id = u.github_id
      ORDER BY c.created_at DESC
    `)
    .all();
  
  return c.json(channels.results || []);
});

// 删除频道
adminRoutes.delete('/channels/:id', async (c) => {
  const channelId = c.req.param('id');
  const admin = c.get('user') as User;
  const db = c.env.DB;
  
  const channel = await db
    .prepare('SELECT * FROM channels WHERE id = ?')
    .bind(channelId)
    .first();
  
  if (!channel) {
    return c.json({ error: 'Channel not found' }, 404);
  }
  
  // 删除频道及其成员
  await db.prepare('DELETE FROM channel_members WHERE channel_id = ?').bind(channelId).run();
  await db.prepare('DELETE FROM channels WHERE id = ?').bind(channelId).run();
  
  await logAction(db, admin.github_id, admin.username, 'channel_delete', 'channel', channelId, {
    channelName: (channel as { name: string }).name,
  });
  
  return c.json({ success: true, message: 'Channel deleted' });
});

// 清空频道消息
adminRoutes.post('/channels/:id/clear', async (c) => {
  const channelId = c.req.param('id');
  const admin = c.get('user') as User;
  const db = c.env.DB;
  
  const channel = await db
    .prepare('SELECT * FROM channels WHERE id = ?')
    .bind(channelId)
    .first();
  
  if (!channel) {
    return c.json({ error: 'Channel not found' }, 404);
  }
  
  // 清空 GitHub 中的消息
  await clearChannelMessages(c.env, channelId);
  
  await logAction(db, admin.github_id, admin.username, 'channel_clear', 'channel', channelId, {
    channelName: (channel as { name: string }).name,
  });
  
  return c.json({ success: true, message: 'Channel messages cleared' });
});

// ===== 审计日志 =====

// 获取操作日志
adminRoutes.get('/logs', async (c) => {
  const query = c.req.query();
  const page = parseInt(query.page) || 1;
  const limit = Math.min(parseInt(query.limit) || 50, 100);
  const offset = (page - 1) * limit;
  const action = query.action;
  const actorId = query.actorId;
  
  const db = c.env.DB;
  
  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  const bindings: unknown[] = [];
  
  if (action) {
    sql += ' AND action = ?';
    bindings.push(action);
  }
  
  if (actorId) {
    sql += ' AND actor_id = ?';
    bindings.push(parseInt(actorId));
  }
  
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  bindings.push(limit, offset);
  
  const logs = await db.prepare(sql).bind(...bindings).all();
  
  const countSql = 'SELECT COUNT(*) as count FROM audit_logs';
  const count = await db.prepare(countSql).first<{ count: number }>();
  
  return c.json({
    logs: logs.results || [],
    total: count?.count || 0,
    page,
    limit,
  });
});

// ===== 统计数据 =====

// 获取仪表盘统计
adminRoutes.get('/stats', async (c) => {
  const db = c.env.DB;
  
  const userCount = await db.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
  const channelCount = await db.prepare('SELECT COUNT(*) as count FROM channels').first<{ count: number }>();
  const bannedCount = await db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'banned'").first<{ count: number }>();
  const onlineCount = await db.prepare('SELECT COUNT(*) as count FROM online_users').first<{ count: number }>();
  
  // 最近 7 天的活跃用户
  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const activeUsers = await db
    .prepare('SELECT COUNT(DISTINCT user_id) as count FROM channel_members WHERE joined_at > ?')
    .bind(weekAgo)
    .first<{ count: number }>();
  
  return c.json({
    users: userCount?.count || 0,
    channels: channelCount?.count || 0,
    banned: bannedCount?.count || 0,
    online: onlineCount?.count || 0,
    activeThisWeek: activeUsers?.count || 0,
  });
});

// 辅助: 记录审计日志
async function logAction(
  db: D1Database,
  actorId: number,
  actorName: string,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown>
): Promise<void> {
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);
  
  await db
    .prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_name, action, target_type, target_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(id, actorId, actorName, action, targetType, targetId, JSON.stringify(details), now)
    .run();
}

export { adminRoutes };
