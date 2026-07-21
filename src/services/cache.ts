/**
 * 缓存服务 - 基于 Cloudflare KV
 */

import type { Env } from '../types';

const DEFAULT_TTL = 60 * 5; // 5 分钟

// 获取缓存
export async function getCache<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const value = await kv.get(key, 'json');
  return value as T | null;
}

// 设置缓存
export async function setCache(
  kv: KVNamespace,
  key: string,
  value: unknown,
  ttl: number = DEFAULT_TTL
): Promise<void> {
  await kv.put(key, JSON.stringify(value), {
    expirationTtl: ttl,
  });
}

// 删除缓存
export async function deleteCache(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(key);
}

// 清除匹配前缀的缓存
export async function clearCacheByPrefix(kv: KVNamespace, prefix: string): Promise<void> {
  const list = await kv.list({ prefix });
  
  for (const key of list.keys) {
    await kv.delete(key.name);
  }
}

// 缓存键生成
export const CacheKeys = {
  user: (id: number) => `user:${id}`,
  channel: (id: string) => `channel:${id}`,
  channelMembers: (channelId: string) => `channel:${channelId}:members`,
  messages: (channelId: string, year: number, month: number) => 
    `messages:${channelId}:${year}:${month}`,
  announcements: () => 'announcements',
  onlineUsers: () => 'online:users',
};

// 在线用户管理
export async function setUserOnline(
  kv: KVNamespace,
  userId: number,
  socketId?: string
): Promise<void> {
  const key = `online:${userId}`;
  await kv.put(key, JSON.stringify({
    lastSeen: Date.now(),
    socketId,
  }), {
    expirationTtl: 60 * 5, // 5 分钟无心跳则过期
  });
}

export async function setUserOffline(kv: KVNamespace, userId: number): Promise<void> {
  const key = `online:${userId}`;
  await kv.delete(key);
}

export async function isUserOnline(kv: KVNamespace, userId: number): Promise<boolean> {
  const key = `online:${userId}`;
  const value = await kv.get(key);
  return value !== null;
}

// 会话管理
export async function createSession(
  kv: KVNamespace,
  userId: number,
  token: string,
  expiresIn: number = 7 * 24 * 60 * 60
): Promise<void> {
  const key = `session:${token}`;
  await kv.put(key, String(userId), {
    expirationTtl: expiresIn,
  });
}

export async function getSession(kv: KVNamespace, token: string): Promise<number | null> {
  const key = `session:${token}`;
  const userId = await kv.get(key);
  return userId ? parseInt(userId, 10) : null;
}

export async function deleteSession(kv: KVNamespace, token: string): Promise<void> {
  const key = `session:${token}`;
  await kv.delete(key);
}
