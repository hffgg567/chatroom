import { nanoid } from 'nanoid';
import * as jose from 'jose';
import type { Env, JWTPayload, GitHubUser, User } from '../types';

const ALGORITHM = 'HS256';
const ACCESS_TOKEN_EXPIRY = '24h';  // 24 小时
const REFRESH_TOKEN_EXPIRY = '7d';  // 7 天

// 生成 JWT Access Token
export async function generateAccessToken(user: User, secret: string): Promise<string> {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: String(user.github_id),
    username: user.username,
    role: user.role,
  };
  
  const token = await new jose.SignJWT(payload as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(new TextEncoder().encode(secret));
  
  return token;
}

// 生成 Refresh Token (存储在 KV)
export async function generateRefreshToken(
  userId: number,
  kv: KVNamespace
): Promise<string> {
  const token = nanoid(64);
  const key = `refresh:${token}`;
  
  await kv.put(key, String(userId), {
    expirationTtl: 7 * 24 * 60 * 60, // 7 天
  });
  
  return token;
}

// 验证并刷新 Token
export async function refreshAccessToken(
  refreshToken: string,
  kv: KVNamespace,
  db: D1Database,
  secret: string
): Promise<{ accessToken: string; user: User } | null> {
  const key = `refresh:${refreshToken}`;
  const userIdStr = await kv.get(key);
  
  if (!userIdStr) {
    return null;
  }
  
  const userId = parseInt(userIdStr, 10);
  
  // 获取用户信息
  const user = await db
    .prepare('SELECT * FROM users WHERE github_id = ?')
    .bind(userId)
    .first<User>();
  
  if (!user || user.status !== 'active') {
    await kv.delete(key);
    return null;
  }
  
  // 生成新的 Access Token
  const accessToken = await generateAccessToken(user, secret);
  
  return { accessToken, user };
}

// 撤销 Refresh Token
export async function revokeRefreshToken(kv: KVNamespace, refreshToken: string): Promise<void> {
  const key = `refresh:${refreshToken}`;
  await kv.delete(key);
}

// GitHub OAuth URL 构建
export function buildGitHubOAuthURL(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user user:email',
    state,
  });
  
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

// 验证 GitHub OAuth Code
export async function exchangeGitHubCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<string> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to exchange GitHub code');
  }
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }
  
  return data.access_token;
}

// 获取 GitHub 用户信息
export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch GitHub user');
  }
  
  return response.json();
}

// 获取 GitHub 用户邮箱
export async function getGitHubEmails(accessToken: string): Promise<Array<{ email: string; primary: boolean; verified: boolean }>> {
  const response = await fetch('https://api.github.com/user/emails', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });
  
  if (!response.ok) {
    return [];
  }
  
  return response.json();
}

// 生成随机状态码
export function generateState(): string {
  return nanoid(32);
}
