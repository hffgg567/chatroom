import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Env, User } from '../types';
import { authMiddleware } from '../middleware/auth';
import { strictRateLimit } from '../middleware/rateLimit';
import { uploadFile, getFileMetadata, getFileUrl } from '../services/storage';
import { CacheKeys, setCache, getCache } from '../services/cache';

const fileRoutes = new Hono<{ Bindings: Env }>();

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm',
  'video/mp4', 'video/webm', 'video/ogg',
  'application/pdf',
  'text/plain', 'text/html', 'text/css', 'text/javascript', 'application/json',
  'application/zip', 'application/x-zip-compressed',
];

// 上传文件
fileRoutes.post('/upload', 
  authMiddleware, 
  strictRateLimit(5, 60 * 1000),
  async (c) => {
    const user = c.get('user') as User;
    
    // 获取 FormData
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const channelId = formData.get('channelId') as string | null;
    
    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }
    
    // 检查文件大小
    if (file.size > MAX_FILE_SIZE) {
      return c.json({ error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` }, 400);
    }
    
    // 检查文件类型
    if (!ALLOWED_TYPES.includes(file.type)) {
      return c.json({ error: 'File type not allowed' }, 400);
    }
    
    // 如果提供了 channelId，检查用户是否是成员
    if (channelId) {
      const membership = await c.env.DB
        .prepare('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?')
        .bind(channelId, user.github_id)
        .first();
      
      if (!membership) {
        return c.json({ error: 'Not a member of this channel' }, 403);
      }
    }
    
    try {
      // 读取文件内容
      const arrayBuffer = await file.arrayBuffer();
      
      // 上传到 GitHub
      const metadata = await uploadFile(
        c.env,
        arrayBuffer,
        file.name,
        file.type,
        user.github_id,
        channelId || undefined
      );
      
      // 生成加速 URL
      const fileUrl = getFileUrl(c.env, metadata);
      
      // 判断文件类型
      const type = file.type.startsWith('image/') ? 'image' : 
                   file.type.startsWith('video/') ? 'video' :
                   file.type.startsWith('audio/') ? 'audio' : 'file';
      
      return c.json({
        id: metadata.id,
        name: metadata.name,
        size: metadata.size,
        type,
        mimeType: metadata.type,
        url: fileUrl,
        uploadedAt: metadata.uploadedAt,
      }, 201);
    } catch (err) {
      console.error('Upload error:', err);
      return c.json({ error: 'Failed to upload file' }, 500);
    }
  }
);

// 获取文件信息
fileRoutes.get('/:fileId', authMiddleware, async (c) => {
  const fileId = c.req.param('fileId');
  
  const metadata = await getFileMetadata(c.env, fileId);
  
  if (!metadata) {
    return c.json({ error: 'File not found' }, 404);
  }
  
  const fileUrl = getFileUrl(c.env, metadata);
  
  return c.json({
    id: metadata.id,
    name: metadata.name,
    size: metadata.size,
    type: metadata.type,
    url: fileUrl,
    uploadedAt: metadata.uploadedAt,
  });
});

// 获取文件内容 (通过 Cloudflare 代理加速)
fileRoutes.get('/:fileId/proxy', authMiddleware, async (c) => {
  const fileId = c.req.param('fileId');
  
  const metadata = await getFileMetadata(c.env, fileId);
  
  if (!metadata) {
    return c.json({ error: 'File not found' }, 404);
  }
  
  const fileUrl = getFileUrl(c.env, metadata);
  
  // 通过 Workers 代理请求，避免 CORS 问题并提供缓存
  try {
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      return c.json({ error: 'Failed to fetch file' }, 502);
    }
    
    // 设置缓存 (1 天)
    c.header('Cache-Control', 'public, max-age=86400');
    c.header('Content-Type', metadata.type);
    c.header('Content-Length', String(metadata.size));
    c.header('Content-Disposition', `inline; filename="${metadata.name}"`);
    
    const body = await response.arrayBuffer();
    
    return c.body(body, 200);
  } catch (err) {
    console.error('Proxy error:', err);
    return c.json({ error: 'Failed to proxy file' }, 502);
  }
});

// 获取原始文件 (重定向到 GitHub)
fileRoutes.get('/:fileId/raw', authMiddleware, async (c) => {
  const fileId = c.req.param('fileId');
  
  const metadata = await getFileMetadata(c.env, fileId);
  
  if (!metadata) {
    return c.json({ error: 'File not found' }, 404);
  }
  
  const fileUrl = getFileUrl(c.env, metadata);
  
  // 重定向到 GitHub 原始文件 URL
  return c.redirect(fileUrl);
});

// 获取用户头像
fileRoutes.get('/avatar/:userId', authMiddleware, async (c) => {
  const userId = c.req.param('userId');
  const db = c.env.DB;
  
  const user = await db
    .prepare('SELECT avatar_url FROM users WHERE github_id = ?')
    .bind(parseInt(userId))
    .first<{ avatar_url: string | null }>();
  
  if (!user || !user.avatar_url) {
    return c.json({ error: 'Avatar not found' }, 404);
  }
  
  // 重定向到 GitHub 头像
  return c.redirect(user.avatar_url);
});

export { fileRoutes };
