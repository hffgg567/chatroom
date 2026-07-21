import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { sign } from 'hono/jwt';
import type { Env, User, GitHubUser } from '../types';
import {
  generateState,
  buildGitHubOAuthURL,
  exchangeGitHubCode,
  getGitHubUser,
  getGitHubEmails,
  generateAccessToken,
  generateRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
} from '../services/auth';
import { authMiddleware } from '../middleware/auth';

const authRoutes = new Hono<{ Bindings: Env }>();

// GitHub OAuth 登录入口
authRoutes.get('/github', (c) => {
  const state = generateState();
  
  // 将 state 存到 KV 防止 CSRF
  c.env.CACHE.put(`oauth:state:${state}`, '1', {
    expirationTtl: 60 * 10, // 10 分钟过期
  });
  
  const redirectUri = `${c.env.APP_URL}/api/auth/github/callback`;
  const authUrl = buildGitHubOAuthURL(c.env.GITHUB_CLIENT_ID, redirectUri, state);
  
  return c.redirect(authUrl);
});

// GitHub OAuth 回调
authRoutes.get('/github/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  
  if (error) {
    return c.redirect(`/login?error=${error}`);
  }
  
  if (!code || !state) {
    return c.redirect('/login?error=invalid_request');
  }
  
  // 验证 state 防止 CSRF
  const stateValid = await c.env.CACHE.get(`oauth:state:${state}`);
  if (!stateValid) {
    return c.redirect('/login?error=invalid_state');
  }
  
  // 删除已使用的 state
  await c.env.CACHE.delete(`oauth:state:${state}`);
  
  try {
    // 获取 GitHub Access Token
    const redirectUri = `${c.env.APP_URL}/api/auth/github/callback`;
    const githubToken = await exchangeGitHubCode(
      code,
      c.env.GITHUB_CLIENT_ID,
      c.env.GITHUB_CLIENT_SECRET,
      redirectUri
    );
    
    // 获取 GitHub 用户信息
    const githubUser: GitHubUser = await getGitHubUser(githubToken);
    
    // 获取邮箱
    const emails = await getGitHubEmails(githubToken);
    const primaryEmail = emails.find(e => e.primary)?.email || githubUser.email || '';
    
    // 检查用户是否已存在
    const db = c.env.DB;
    let existingUser = await db
      .prepare('SELECT * FROM users WHERE github_id = ?')
      .bind(githubUser.id)
      .first<User>();
    
    if (!existingUser) {
      // 新用户注册
      const userId = nanoid();
      const now = Math.floor(Date.now() / 1000);
      
      // 检查是否第一个用户 (设置为管理员)
      const userCount = await db.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
      const role = userCount?.count === 0 ? 'admin' : 'user';
      
      await db
        .prepare(`
          INSERT INTO users (id, github_id, username, display_name, avatar_url, email, role, github_token, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          userId,
          githubUser.id,
          githubUser.login,
          githubUser.name || githubUser.login,
          githubUser.avatar_url,
          primaryEmail,
          role,
          githubToken,
          now,
          now
        )
        .run();
      
      existingUser = await db
        .prepare('SELECT * FROM users WHERE github_id = ?')
        .bind(githubUser.id)
        .first<User>();
      
      // 审计日志
      await logAction(db, githubUser.id, githubUser.login, 'user_register', 'user', String(githubUser.id), {});
    } else {
      // 更新用户信息
      const now = Math.floor(Date.now() / 1000);
      await db
        .prepare(`
          UPDATE users 
          SET username = ?, display_name = ?, avatar_url = ?, email = ?, github_token = ?, updated_at = ?
          WHERE github_id = ?
        `)
        .bind(
          githubUser.login,
          githubUser.name || githubUser.login,
          githubUser.avatar_url,
          primaryEmail,
          githubToken,
          now,
          githubUser.id
        )
        .run();
    }
    
    if (!existingUser) {
      return c.redirect('/login?error=user_creation_failed');
    }
    
    // 生成 Token
    const accessToken = await generateAccessToken(existingUser, c.env.JWT_SECRET);
    const refreshToken = await generateRefreshToken(existingUser.github_id, c.env.CACHE);
    
    // 重定向到前端，带上 Token
    return c.redirect(`/login?token=${accessToken}&refresh=${refreshToken}&user=${encodeURIComponent(JSON.stringify(existingUser))}`);
  } catch (err) {
    console.error('OAuth error:', err);
    return c.redirect('/login?error=auth_failed');
  }
});

// 刷新 Token
authRoutes.post('/refresh', async (c) => {
  const { refreshToken } = await c.req.json();
  
  if (!refreshToken) {
    return c.json({ error: 'Refresh token is required' }, 400);
  }
  
  const result = await refreshAccessToken(
    refreshToken,
    c.env.CACHE,
    c.env.DB,
    c.env.JWT_SECRET
  );
  
  if (!result) {
    return c.json({ error: 'Invalid refresh token' }, 401);
  }
  
  return c.json({
    accessToken: result.accessToken,
    user: {
      id: result.user.id,
      github_id: result.user.github_id,
      username: result.user.username,
      display_name: result.user.display_name,
      avatar_url: result.user.avatar_url,
      role: result.user.role,
    },
  });
});

// 登出
authRoutes.post('/logout', authMiddleware, async (c) => {
  const user = c.get('user') as User;
  
  // 清除用户的 GitHub Token (保留用户数据)
  const db = c.env.DB;
  await db
    .prepare('UPDATE users SET github_token = NULL, updated_at = ? WHERE github_id = ?')
    .bind(Math.floor(Date.now() / 1000), user.github_id)
    .run();
  
  return c.json({ success: true, message: 'Logged out' });
});

// 当前用户信息
authRoutes.get('/me', authMiddleware, (c) => {
  const user = c.get('user') as User;
  return c.json({
    id: user.id,
    github_id: user.github_id,
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    email: user.email,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
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

export { authRoutes };
