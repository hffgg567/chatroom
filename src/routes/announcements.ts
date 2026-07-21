import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env, User, Announcement } from '../types';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const announcementRoutes = new Hono<{ Bindings: Env }>();

// 获取公告列表 (公开)
announcementRoutes.get('/', async (c) => {
  const db = c.env.DB;
  
  const announcements = await db
    .prepare(`
      SELECT a.id, a.title, a.content, a.priority, a.pinned, a.created_at,
             u.username as author_name, u.avatar_url as author_avatar
      FROM announcements a
      LEFT JOIN users u ON a.author_id = u.github_id
      ORDER BY a.pinned DESC, a.created_at DESC
      LIMIT 50
    `)
    .all();
  
  return c.json(announcements.results || []);
});

// 获取置顶公告
announcementRoutes.get('/pinned', async (c) => {
  const db = c.env.DB;
  
  const announcements = await db
    .prepare(`
      SELECT a.id, a.title, a.content, a.priority, a.created_at,
             u.username as author_name, u.avatar_url as author_avatar
      FROM announcements a
      LEFT JOIN users u ON a.author_id = u.github_id
      WHERE a.pinned = 1
      ORDER BY a.created_at DESC
    `)
    .all();
  
  return c.json(announcements.results || []);
});

// 获取单个公告
announcementRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  
  const announcement = await db
    .prepare(`
      SELECT a.*, u.username as author_name, u.avatar_url as author_avatar
      FROM announcements a
      LEFT JOIN users u ON a.author_id = u.github_id
      WHERE a.id = ?
    `)
    .bind(id)
    .first();
  
  if (!announcement) {
    return c.json({ error: 'Announcement not found' }, 404);
  }
  
  return c.json(announcement);
});

// 创建公告 (仅管理员)
announcementRoutes.post('/', authMiddleware, adminMiddleware, async (c) => {
  const user = c.get('user') as User;
  const db = c.env.DB;
  
  const { title, content, priority = 'normal', pinned = false } = await c.req.json();
  
  if (!title || !title.trim()) {
    return c.json({ error: 'Title is required' }, 400);
  }
  
  if (!content || !content.trim()) {
    return c.json({ error: 'Content is required' }, 400);
  }
  
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);
  
  await db
    .prepare(`
      INSERT INTO announcements (id, title, content, author_id, priority, pinned, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(id, title.trim(), content.trim(), user.github_id, priority, pinned ? 1 : 0, now)
    .run();
  
  // 审计日志
  await logAction(db, user.github_id, user.username, 'announcement_create', 'announcement', id, {
    title,
    priority,
    pinned,
  });
  
  return c.json({
    id,
    title,
    content,
    priority,
    pinned,
    created_at: now,
  }, 201);
});

// 更新公告 (仅管理员)
announcementRoutes.put('/:id', authMiddleware, adminMiddleware, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as User;
  const db = c.env.DB;
  
  const existing = await db
    .prepare('SELECT * FROM announcements WHERE id = ?')
    .bind(id)
    .first();
  
  if (!existing) {
    return c.json({ error: 'Announcement not found' }, 404);
  }
  
  const { title, content, priority, pinned } = await c.req.json();
  
  if (title !== undefined) {
    await db.prepare('UPDATE announcements SET title = ? WHERE id = ?').bind(title, id).run();
  }
  
  if (content !== undefined) {
    await db.prepare('UPDATE announcements SET content = ? WHERE id = ?').bind(content, id).run();
  }
  
  if (priority !== undefined) {
    await db.prepare('UPDATE announcements SET priority = ? WHERE id = ?').bind(priority, id).run();
  }
  
  if (pinned !== undefined) {
    await db.prepare('UPDATE announcements SET pinned = ? WHERE id = ?').bind(pinned ? 1 : 0, id).run();
  }
  
  await logAction(db, user.github_id, user.username, 'announcement_update', 'announcement', id, {
    changes: { title, content, priority, pinned },
  });
  
  const updated = await db.prepare('SELECT * FROM announcements WHERE id = ?').bind(id).first();
  
  return c.json(updated);
});

// 删除公告 (仅管理员)
announcementRoutes.delete('/:id', authMiddleware, adminMiddleware, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as User;
  const db = c.env.DB;
  
  const existing = await db.prepare('SELECT * FROM announcements WHERE id = ?').bind(id).first();
  
  if (!existing) {
    return c.json({ error: 'Announcement not found' }, 404);
  }
  
  await db.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run();
  
  await logAction(db, user.github_id, user.username, 'announcement_delete', 'announcement', id, {
    title: (existing as { title: string }).title,
  });
  
  return c.json({ success: true, message: 'Announcement deleted' });
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

export { announcementRoutes };
