import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env, User, Channel, ChannelMember } from '../types';
import { authMiddleware } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { saveChannelConfig } from '../services/storage';
import { CacheKeys, setCache, getCache, deleteCache } from '../services/cache';

const channelRoutes = new Hono<{ Bindings: Env }>();

// 获取频道列表 (需要认证)
channelRoutes.get('/', authMiddleware, async (c) => {
  const user = c.get('user') as User;
  const db = c.env.DB;
  
  const channels = await db
    .prepare(`
      SELECT c.*, cm.role as member_role, cm.joined_at as member_joined_at
      FROM channels c
      INNER JOIN channel_members cm ON c.id = cm.channel_id
      WHERE cm.user_id = ?
      ORDER BY c.created_at DESC
    `)
    .bind(user.github_id)
    .all();
  
  return c.json(channels.results || []);
});

// 获取公开频道列表 (不需要认证)
channelRoutes.get('/public', async (c) => {
  const db = c.env.DB;
  
  const channels = await db
    .prepare(`
      SELECT id, name, description, is_default, max_members, avatar_url, 
             (SELECT COUNT(*) FROM channel_members WHERE channel_id = channels.id) as member_count
      FROM channels 
      WHERE is_private = 0
      ORDER BY is_default DESC, created_at DESC
    `)
    .all();
  
  return c.json(channels.results || []);
});

// 创建频道
channelRoutes.post('/', authMiddleware, rateLimit({ maxRequests: 5, windowMs: 60 * 1000 }), async (c) => {
  const user = c.get('user') as User;
  const db = c.env.DB;
  
  const { name, description, isPrivate } = await c.req.json();
  
  if (!name || !name.trim()) {
    return c.json({ error: 'Channel name is required' }, 400);
  }
  
  if (name.length > 50) {
    return c.json({ error: 'Channel name too long (max 50)' }, 400);
  }
  
  const id = `c_${nanoid(12)}`;
  const now = Math.floor(Date.now() / 1000);
  
  await db
    .prepare(`
      INSERT INTO channels (id, name, description, owner_id, is_private, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(id, name.trim(), description || null, user.github_id, isPrivate ? 1 : 0, now, now)
    .run();
  
  // 创建者自动成为 owner
  await db
    .prepare(`
      INSERT INTO channel_members (channel_id, user_id, role, joined_at)
      VALUES (?, ?, ?, ?)
    `)
    .bind(id, user.github_id, 'owner', now)
    .run();
  
  // 获取创建的频道
  const channel = await db
    .prepare('SELECT * FROM channels WHERE id = ?')
    .bind(id)
    .first<Channel>();
  
  // 保存配置到 GitHub
  if (channel) {
    await saveChannelConfig(c.env, channel);
  }
  
  // 清除缓存
  await deleteCache(c.env.CACHE, CacheKeys.channel(id));
  
  return c.json(channel, 201);
});

// 获取频道详情
channelRoutes.get('/:id', authMiddleware, async (c) => {
  const user = c.get('user') as User;
  const channelId = c.req.param('id');
  const db = c.env.DB;
  
  // 检查缓存
  const cacheKey = CacheKeys.channel(channelId);
  let channel = await getCache<Channel>(c.env.CACHE, cacheKey);
  
  if (!channel) {
    channel = await db
      .prepare('SELECT * FROM channels WHERE id = ?')
      .bind(channelId)
      .first<Channel>();
    
    if (channel) {
      await setCache(c.env.CACHE, cacheKey, channel, 60);
    }
  }
  
  if (!channel) {
    return c.json({ error: 'Channel not found' }, 404);
  }
  
  // 检查是否私密频道且用户是成员
  if (channel.is_private) {
    const member = await db
      .prepare('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?')
      .bind(channelId, user.github_id)
      .first();
    
    if (!member && channel.owner_id !== user.github_id) {
      return c.json({ error: 'Private channel' }, 403);
    }
  }
  
  // 获取成员数量
  const memberCount = await db
    .prepare('SELECT COUNT(*) as count FROM channel_members WHERE channel_id = ?')
    .bind(channelId)
    .first<{ count: number }>();
  
  return c.json({
    ...channel,
    member_count: memberCount?.count || 0,
  });
});

// 更新频道
channelRoutes.put('/:id', authMiddleware, async (c) => {
  const user = c.get('user') as User;
  const channelId = c.req.param('id');
  const db = c.env.DB;
  
  const channel = await db
    .prepare('SELECT * FROM channels WHERE id = ?')
    .bind(channelId)
    .first<Channel>();
  
  if (!channel) {
    return c.json({ error: 'Channel not found' }, 404);
  }
  
  // 只有 owner 或 admin 可以更新
  if (channel.owner_id !== user.github_id && user.role !== 'admin') {
    return c.json({ error: 'Permission denied' }, 403);
  }
  
  const { name, description, avatar_url } = await c.req.json();
  const now = Math.floor(Date.now() / 1000);
  
  if (name && name.trim()) {
    await db
      .prepare('UPDATE channels SET name = ?, updated_at = ? WHERE id = ?')
      .bind(name.trim(), now, channelId)
      .run();
  }
  
  if (description !== undefined) {
    await db
      .prepare('UPDATE channels SET description = ?, updated_at = ? WHERE id = ?')
      .bind(description, now, channelId)
      .run();
  }
  
  if (avatar_url !== undefined) {
    await db
      .prepare('UPDATE channels SET avatar_url = ?, updated_at = ? WHERE id = ?')
      .bind(avatar_url, now, channelId)
      .run();
  }
  
  // 清除缓存
  await deleteCache(c.env.CACHE, CacheKeys.channel(channelId));
  
  const updated = await db
    .prepare('SELECT * FROM channels WHERE id = ?')
    .bind(channelId)
    .first<Channel>();
  
  return c.json(updated);
});

// 删除频道 (owner 或 admin)
channelRoutes.delete('/:id', authMiddleware, async (c) => {
  const user = c.get('user') as User;
  const channelId = c.req.param('id');
  const db = c.env.DB;
  
  const channel = await db
    .prepare('SELECT * FROM channels WHERE id = ?')
    .bind(channelId)
    .first<Channel>();
  
  if (!channel) {
    return c.json({ error: 'Channel not found' }, 404);
  }
  
  if (channel.owner_id !== user.github_id && user.role !== 'admin') {
    return c.json({ error: 'Permission denied' }, 403);
  }
  
  await db
    .prepare('DELETE FROM channels WHERE id = ?')
    .bind(channelId)
    .run();
  
  // 删除缓存
  await deleteCache(c.env.CACHE, CacheKeys.channel(channelId));
  await deleteCache(c.env.CACHE, CacheKeys.channelMembers(channelId));
  
  return c.json({ success: true, message: 'Channel deleted' });
});

// 加入频道
channelRoutes.post('/:id/join', authMiddleware, async (c) => {
  const user = c.get('user') as User;
  const channelId = c.req.param('id');
  const db = c.env.DB;
  
  const channel = await db
    .prepare('SELECT * FROM channels WHERE id = ?')
    .bind(channelId)
    .first<Channel>();
  
  if (!channel) {
    return c.json({ error: 'Channel not found' }, 404);
  }
  
  // 检查是否私密
  if (channel.is_private) {
    return c.json({ error: 'Private channel requires invitation' }, 403);
  }
  
  // 检查是否已经是成员
  const existingMember = await db
    .prepare('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?')
    .bind(channelId, user.github_id)
    .first();
  
  if (existingMember) {
    return c.json({ message: 'Already a member' });
  }
  
  // 检查人数限制
  const memberCount = await db
    .prepare('SELECT COUNT(*) as count FROM channel_members WHERE channel_id = ?')
    .bind(channelId)
    .first<{ count: number }>();
  
  if (memberCount && memberCount.count >= channel.max_members) {
    return c.json({ error: 'Channel is full' }, 400);
  }
  
  const now = Math.floor(Date.now() / 1000);
  
  await db
    .prepare('INSERT INTO channel_members (channel_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
    .bind(channelId, user.github_id, 'member', now)
    .run();
  
  // 清除成员缓存
  await deleteCache(c.env.CACHE, CacheKeys.channelMembers(channelId));
  
  return c.json({ success: true, message: 'Joined channel' });
});

// 离开频道
channelRoutes.post('/:id/leave', authMiddleware, async (c) => {
  const user = c.get('user') as User;
  const channelId = c.req.param('id');
  const db = c.env.DB;
  
  const channel = await db
    .prepare('SELECT * FROM channels WHERE id = ?')
    .bind(channelId)
    .first<Channel>();
  
  if (!channel) {
    return c.json({ error: 'Channel not found' }, 404);
  }
  
  // owner 不能离开，需要转让所有权或删除频道
  if (channel.owner_id === user.github_id) {
    return c.json({ error: 'Owner cannot leave. Delete or transfer the channel instead.' }, 400);
  }
  
  await db
    .prepare('DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?')
    .bind(channelId, user.github_id)
    .run();
  
  await deleteCache(c.env.CACHE, CacheKeys.channelMembers(channelId));
  
  return c.json({ success: true, message: 'Left channel' });
});

// 获取频道成员
channelRoutes.get('/:id/members', authMiddleware, async (c) => {
  const user = c.get('user') as User;
  const channelId = c.req.param('id');
  const db = c.env.DB;
  
  // 检查是否是成员
  const membership = await db
    .prepare('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?')
    .bind(channelId, user.github_id)
    .first();
  
  if (!membership && user.role !== 'admin') {
    return c.json({ error: 'Not a member of this channel' }, 403);
  }
  
  const cacheKey = CacheKeys.channelMembers(channelId);
  let members = await getCache<unknown[]>(c.env.CACHE, cacheKey);
  
  if (!members) {
    members = await db
      .prepare(`
        SELECT cm.*, u.username, u.display_name, u.avatar_url, u.status
        FROM channel_members cm
        INNER JOIN users u ON cm.user_id = u.github_id
        WHERE cm.channel_id = ?
        ORDER BY cm.role = 'owner' DESC, cm.role = 'admin' DESC, cm.joined_at ASC
      `)
      .bind(channelId)
      .all()
      .then(r => r.results || []);
    
    await setCache(c.env.CACHE, cacheKey, members, 30);
  }
  
  return c.json(members);
});

export { channelRoutes };
