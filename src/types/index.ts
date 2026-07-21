// Cloudflare Workers 环境变量类型定义
export interface Env {
  // Cloudflare D1 数据库
  DB: D1Database;
  
  // Cloudflare KV 命名空间 (缓存)
  CACHE: KVNamespace;
  
  // Cloudflare R2 存储
  STORAGE: R2Bucket;
  
  // 环境变量
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_REPO_TOKEN: string;
  GITHUB_DATA_REPO: string;
  APP_URL: string;
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;
}

// 用户类型
export interface User {
  id: string;
  github_id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'banned';
  mute_until: number | null;
  created_at: number;
  updated_at: number;
}

// 群组类型
export interface Channel {
  id: string;
  name: string;
  description: string | null;
  owner_id: number;
  is_private: boolean;
  is_default: boolean;
  max_members: number;
  avatar_url: string | null;
  created_at: number;
  updated_at: number;
}

// 群组成员类型
export interface ChannelMember {
  channel_id: string;
  user_id: number;
  role: 'owner' | 'admin' | 'member';
  nickname: string | null;
  joined_at: number;
  last_read_at: number | null;
}

// 消息类型
export interface Message {
  id: string;
  channel_id: string;
  user_id: number;
  username: string;
  avatar_url: string | null;
  content: string;
  type: 'text' | 'file' | 'image' | 'system';
  metadata: MessageMetadata | null;
  reply_to: string | null;
  mentions: number[];
  reactions: Record<string, number[]>;
  created_at: number;
  updated_at: number;
}

export interface MessageMetadata {
  file_name?: string;
  file_size?: number;
  file_url?: string;
  file_type?: string;
  width?: number;
  height?: number;
}

// 通知类型
export interface Announcement {
  id: string;
  title: string;
  content: string;
  author_id: number;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  pinned: boolean;
  created_at: number;
}

// JWT Payload
export interface JWTPayload {
  sub: string;           // 用户 ID (github_id)
  username: string;
  role: 'user' | 'admin';
  iat: number;
  exp: number;
}

// API 响应类型
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 分页参数
export interface PaginationParams {
  limit?: number;
  offset?: number;
  before?: number;
  after?: number;
}

// GitHub OAuth 类型
export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  html_url: string;
}
