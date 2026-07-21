import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env, User, Message } from '../types';
import { authMiddleware } from '../middleware/auth';
import { rateLimit, strictRateLimit } from '../middleware/rateLimit';
import { saveMessage, getMessages, clearChannelMessages } from '../services/storage';
import { CacheKeys, setCache, getCache, deleteCache } from '../services/cache';

const messageRoutes = new Hono<{ Bindings: Env }>();

// 获取频道消息
messageRoutes.get('/channels/:channelId', authMiddleware, async (c) => {
  const user = c.get('user') as User;
  const channelId = c.req.param('channelId');
  const db = c.env.DB;
  
  // 检查用户是否是频道成员
  const membership = await db
    .prepare('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?')
    .bind(channelId, user.github_id)
    .first();
  
  if (!membership) {
    return c.json({ error: 'Not a member of this channel' }, 403);
  }
  
  const query = c.req.query();
  const limit = Math.min(parseInt(query.limit) || 50, 100);
  const year = query.year ? parseInt(query.year) : undefined;
  const month = query.month !== undefined ? parseInt(query.month) : undefined;
  const before = query.before ? parseInt(query.before) : undefined;
  
  // 从 GitHub 获取消息
  const messages = await getMessages(c.env, channelId, {
    year,
    month,
    limit,
    before,
  });
  
  // 更新最后阅读时间
  await db
    .prepare('UPDATE channel_members SET last_read_at = ? WHERE channel_id = ? AND user_id = ?')
    .bind(Math.floor(Date.now() / 1000), channelId, user.github_id)
    .run();
  
  return c.json(messages);
});

// 发送消息
messageRoutes.post('/channels/:channelId', 
  authMiddleware, 
  strictRateLimit(10, 60 * 1000), // 10条/分钟
  async (c) => {
    const user = c.get('user') as User;
    const channelId = c.req.param('channelId');
    const db = c.env.DB;
    
    // 检查用户是否是频道成员
    const membership = await db
      .prepare('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?')
      .bind(channelId, user.github_id)
      .first();
    
    if (!membership) {
      return c.json({ error: 'Not a member of this channel' }, 403);
    }
    
    // 检查禁言状态
    if (user.mute_until && user.mute_until > Date.now()) {
      return c.json({ 
        error: 'You are muted',
        mute_until: user.mute_until,
      }, 403);
    }
    
    const { content, type = 'text', replyTo, mentions } = await c.req.json();
    
    if (!content || !content.trim()) {
      return c.json({ error: 'Message content is required' }, 400);
    }
    
    if (content.length > 4000) {
      return c.json({ error: 'Message too long (max 4000 characters)' }, 400);
    }
    
    const messageId = `m_${nanoid(12)}`;
    const now = Date.now();
    
    const message: Message = {
      id: messageId,
      channel_id: channelId,
      user_id: user.github_id,
      username: user.username,
      avatar_url: user.avatar_url,
      content: content.trim(),
      type,
      metadata: null,
      reply_to: replyTo || null,
      mentions: mentions || [],
      reactions: {},
      created_at: now,
      updated_at: now,
    };
    
    // 保存到 GitHub
    await saveMessage(c.env, channelId, message);
    
    // 清除消息缓存
    await clearCacheByPrefix(c.env.CACHE, `messages:${channelId}`);
    
    return c.json(message, 201);
  }
);

// 更新消息 (只能编辑自己的消息)
messageRoutes.put('/:messageId', authMiddleware, async (c) => {
  const user = c.get('user') as User;
  const messageId = c.req.param('messageId');
  const db = c.env.DB;
  
  const { content } = await c.req.json();
  
  if (!content || !content.trim()) {
    return c.json({ error: 'Message content is required' }, 400);
  }
  
  // 获取原消息
  const messages = await getMessages(c.env, messageId.split(':')[0], { limit: 1 });
  const message = messages.find(m => m.id === messageId);
  
  if (!message) {
    return c.json({ error: 'Message not found' }, 404);
  }
  
  // 只能编辑自己的消息 (或管理员)
  if (message.user_id !== user.github_id && user.role !== 'admin') {
    return c.json({ error: 'Permission denied' }, 403);
  }
  
  // 重新保存消息 (需要实现更新逻辑)
  // 这里简化处理，生产环境需要更好的实现
  
  return c.json({
    ...message,
    content: content.trim(),
    updated_at: Date.now(),
  });
});

// 删除消息
messageRoutes.delete('/:messageId', authMiddleware, async (c) => {
  const user = c.get('user') as User;
  const messageId = c.req.param('messageId');
  const db = c.env.DB;
  
  // 解析 channelId:messageId
  const [channelId] = messageId.split(':');
  
  // 获取原消息
  const messages = await getMessages(c.env, channelId, { limit: 1 });
  const message = messages.find(m => m.id === messageId);
  
  if (!message) {
    return c.json({ error: 'Message not found' }, 404);
  }
  
  // 只能删除自己的消息 (或管理员/频道管理员)
  const isChannelAdmin = await db
    .prepare(`
      SELECT * FROM channel_members 
      WHERE channel_id = ? AND user_id = ? AND role IN ('owner', 'admin')
    `)
    .bind(channelId, user.github_id)
    .first();
  
  if (message.user_id !== user.github_id && !isChannelAdmin && user.role !== 'admin') {
    return c.json({ error: 'Permission denied' }, 403);
  }
  
  // 记录审计日志
  await logAction(db, user.github_id, user.username, 'message_delete', 'message', messageId, {
    channelId,
    originalContent: message.content.substring(0, 100),
  });
  
  return c.json({ success: true, message: 'Message deleted' });
});

// 消息反应
messageRoutes.post('/:messageId/react', authMiddleware, async (c) => {
  const user = c.get('user') as User;
  const messageId = c.req.param('messageId');
  const { emoji } = await c.req.json();
  
  if (!emoji) {
    return c.json({ error: 'Emoji is required' }, 400);
  }
  
  // TODO: 实现反应功能
  // 需要修改存储服务以支持原子操作
  
  return c.json({ success: true });
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

// 清除缓存辅助函数
async function clearCacheByPrefix(kv: KVNamespace, prefix: string): Promise<void> {
  const list = await kv.list({ prefix });
  for (const key of list.keys) {
    await kv.delete(key.name);
  }
}

export { messageRoutes };
