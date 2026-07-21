import { Hono } from 'hono';
import type { Env, User } from '../types';
import { authMiddleware } from '../middleware/auth';

const userRoutes = new Hono<{ Bindings: Env }>();

// 获取用户信息
userRoutes.get('/:id', authMiddleware, async (c) => {
  const userId = c.req.param('id');
  const db = c.env.DB;
  
  const user = await db
    .prepare(`
      SELECT github_id, username, display_name, avatar_url, role, created_at
      FROM users 
      WHERE github_id = ?
    `)
    .bind(parseInt(userId))
    .first<User>();
  
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }
  
  return c.json({
    id: user.id,
    github_id: user.github_id,
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    role: user.role,
    created_at: user.created_at,
  });
});

// 搜索用户
userRoutes.get('/', authMiddleware, async (c) => {
  const query = c.req.query('q');
  
  if (!query || query.length < 2) {
    return c.json({ error: 'Query must be at least 2 characters' }, 400);
  }
  
  const db = c.env.DB;
  
  const users = await db
    .prepare(`
      SELECT github_id, username, display_name, avatar_url
      FROM users 
      WHERE (username LIKE ? OR display_name LIKE ?) AND status = 'active'
      LIMIT 20
    `)
    .bind(`%${query}%`, `%${query}%`)
    .all();
  
  return c.json(users.results || []);
});

// 更新个人资料
userRoutes.put('/me', authMiddleware, async (c) => {
  const user = c.get('user') as User;
  const db = c.env.DB;
  
  const { display_name } = await c.req.json();
  
  if (display_name !== undefined) {
    await db
      .prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE github_id = ?')
      .bind(display_name, Math.floor(Date.now() / 1000), user.github_id)
      .run();
  }
  
  const updated = await db
    .prepare('SELECT * FROM users WHERE github_id = ?')
    .bind(user.github_id)
    .first<User>();
  
  return c.json({
    github_id: updated?.github_id,
    username: updated?.username,
    display_name: updated?.display_name,
    avatar_url: updated?.avatar_url,
  });
});

export { userRoutes };
