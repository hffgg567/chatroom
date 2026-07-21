/**
 * GitHub 存储服务 - 用于存储聊天记录和文件
 * 数据存储在 GitHub 私有仓库中，通过 Cloudflare Workers 代理访问
 */

import { nanoid } from 'nanoid';
import type { Env, Message, Channel } from '../types';

const API_BASE = 'https://api.github.com';
const DATA_BRANCH = 'main';

// GitHub API 请求封装
async function githubAPI(
  endpoint: string,
  options: RequestInit = {},
  token: string
): Promise<Response> {
  const url = endpoint.startsWith('http') 
    ? endpoint 
    : `${API_BASE}${endpoint}`;
  
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

// 创建或更新文件
async function upsertFile(
  repo: string,
  path: string,
  content: string,
  message: string,
  token: string,
  sha?: string
): Promise<void> {
  const encodedContent = btoa(unescape(encodeURIComponent(content)));
  
  const body: Record<string, unknown> = {
    message,
    content: encodedContent,
    branch: DATA_BRANCH,
  };
  
  if (sha) {
    body.sha = sha;
  }
  
  const response = await githubAPI(
    `/repos/${repo}/contents/${path}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
    token
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upsert file: ${error}`);
  }
}

// 获取文件内容
async function getFile(
  repo: string,
  path: string,
  token: string
): Promise<{ content: string; sha: string } | null> {
  const response = await githubAPI(
    `/repos/${repo}/contents/${path}?ref=${DATA_BRANCH}`,
    { method: 'GET' },
    token
  );
  
  if (response.status === 404) {
    return null;
  }
  
  if (!response.ok) {
    throw new Error('Failed to get file');
  }
  
  const data = await response.json();
  
  if (data.encoding === 'base64') {
    return {
      content: atob(data.content.replace(/\n/g, '')),
      sha: data.sha,
    };
  }
  
  return null;
}

// 删除文件
async function deleteFile(
  repo: string,
  path: string,
  sha: string,
  message: string,
  token: string
): Promise<void> {
  const response = await githubAPI(
    `/repos/${repo}/contents/${path}`,
    {
      method: 'DELETE',
      body: JSON.stringify({
        message,
        sha,
        branch: DATA_BRANCH,
      }),
    },
    token
  );
  
  if (!response.ok && response.status !== 404) {
    throw new Error('Failed to delete file');
  }
}

// ===== 聊天记录存储 =====

interface MessageStore {
  messages: Message[];
  lastUpdated: number;
}

// 保存消息到 GitHub
export async function saveMessage(
  env: Env,
  channelId: string,
  message: Message
): Promise<void> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  
  const path = `data/messages/${channelId}/${year}-${month}.json`;
  const existing = await getFile(env.GITHUB_DATA_REPO, path, env.GITHUB_REPO_TOKEN);
  
  let store: MessageStore;
  
  if (existing) {
    try {
      store = JSON.parse(existing.content);
      store.messages.push(message);
      store.lastUpdated = Date.now();
    } catch {
      store = { messages: [message], lastUpdated: Date.now() };
    }
  } else {
    store = { messages: [message], lastUpdated: Date.now() };
  }
  
  await upsertFile(
    env.GITHUB_DATA_REPO,
    path,
    JSON.stringify(store, null, 2),
    `Add message to channel ${channelId}`,
    env.GITHUB_REPO_TOKEN,
    existing?.sha
  );
}

// 获取消息历史
export async function getMessages(
  env: Env,
  channelId: string,
  options: { year?: number; month?: number; limit?: number; before?: number } = {}
): Promise<Message[]> {
  const now = new Date();
  const year = options.year || now.getFullYear();
  const month = options.month !== undefined 
    ? String(options.month + 1).padStart(2, '0')
    : String(now.getMonth() + 1).padStart(2, '0');
  
  const path = `data/messages/${channelId}/${year}-${month}.json`;
  const existing = await getFile(env.GITHUB_DATA_REPO, path, env.GITHUB_REPO_TOKEN);
  
  if (!existing) {
    return [];
  }
  
  try {
    const store: MessageStore = JSON.parse(existing.content);
    let messages = store.messages;
    
    // 按时间筛选
    if (options.before) {
      messages = messages.filter(m => m.created_at < options.before);
    }
    
    // 排序并限制数量
    messages.sort((a, b) => b.created_at - a.created_at);
    
    if (options.limit) {
      messages = messages.slice(0, options.limit);
    }
    
    return messages.reverse();
  } catch {
    return [];
  }
}

// 清空频道消息
export async function clearChannelMessages(
  env: Env,
  channelId: string
): Promise<void> {
  // 获取所有月份的文件
  const currentYear = new Date().getFullYear();
  
  for (let year = 2025; year <= currentYear; year++) {
    for (let month = 0; month < 12; month++) {
      const monthStr = String(month + 1).padStart(2, '0');
      const path = `data/messages/${channelId}/${year}-${monthStr}.json`;
      
      const existing = await getFile(env.GITHUB_DATA_REPO, path, env.GITHUB_REPO_TOKEN);
      
      if (existing) {
        await deleteFile(
          env.GITHUB_DATA_REPO,
          path,
          existing.sha,
          `Clear messages for channel ${channelId}`,
          env.GITHUB_REPO_TOKEN
        );
      }
    }
  }
  
  // 删除索引文件
  const indexPath = `data/messages/${channelId}/index.json`;
  const indexFile = await getFile(env.GITHUB_DATA_REPO, indexPath, env.GITHUB_REPO_TOKEN);
  
  if (indexFile) {
    await deleteFile(
      env.GITHUB_DATA_REPO,
      indexPath,
      indexFile.sha,
      `Clear channel index ${channelId}`,
      env.GITHUB_REPO_TOKEN
    );
  }
}

// ===== 文件存储 =====

interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedBy: number;
  uploadedAt: number;
  channelId?: string;
}

// 上传文件到 GitHub
export async function uploadFile(
  env: Env,
  fileData: ArrayBuffer,
  fileName: string,
  mimeType: string,
  userId: number,
  channelId?: string
): Promise<FileMetadata> {
  const id = nanoid();
  const ext = fileName.split('.').pop() || '';
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  
  const path = `files/${year}/${month}/${id}.${ext}`;
  const metaPath = `files/${year}/${month}/${id}.meta.json`;
  
  const metadata: FileMetadata = {
    id,
    name: fileName,
    size: fileData.byteLength,
    type: mimeType,
    uploadedBy: userId,
    uploadedAt: Date.now(),
    channelId,
  };
  
  // 上传文件内容
  const base64 = btoa(String.fromCharCode(...new Uint8Array(fileData)));
  
  await upsertFile(
    env.GITHUB_DATA_REPO,
    path,
    base64,
    `Upload file: ${fileName}`,
    env.GITHUB_REPO_TOKEN
  );
  
  // 保存元数据
  await upsertFile(
    env.GITHUB_DATA_REPO,
    metaPath,
    JSON.stringify(metadata, null, 2),
    `Add metadata for: ${fileName}`,
    env.GITHUB_REPO_TOKEN
  );
  
  return metadata;
}

// 获取文件
export async function getFileMetadata(
  env: Env,
  fileId: string
): Promise<FileMetadata | null> {
  // 搜索所有可能的路径
  const currentYear = new Date().getFullYear();
  
  for (let year = 2025; year <= currentYear; year++) {
    for (let month = 1; month <= 12; month++) {
      const monthStr = String(month).padStart(2, '0');
      const metaPath = `files/${year}/${monthStr}/${fileId}.meta.json`;
      
      const existing = await getFile(env.GITHUB_DATA_REPO, metaPath, env.GITHUB_REPO_TOKEN);
      
      if (existing) {
        try {
          return JSON.parse(existing.content);
        } catch {
          return null;
        }
      }
    }
  }
  
  return null;
}

// 获取文件内容 URL
export function getFileUrl(
  env: Env,
  metadata: FileMetadata
): string {
  // 使用 raw.githubusercontent.com 直链
  // 生产环境应该通过 Workers 代理以提高访问速度
  const now = new Date(metadata.uploadedAt);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const ext = metadata.name.split('.').pop() || '';
  
  return `https://raw.githubusercontent.com/${env.GITHUB_DATA_REPO}/${DATA_BRANCH}/files/${year}/${month}/${metadata.id}.${ext}`;
}

// ===== 频道配置存储 =====

interface ChannelData {
  channel: Channel;
  settings: Record<string, unknown>;
}

// 保存频道配置
export async function saveChannelConfig(
  env: Env,
  channel: Channel
): Promise<void> {
  const path = `data/channels/${channel.id}.json`;
  const existing = await getFile(env.GITHUB_DATA_REPO, path, env.GITHUB_REPO_TOKEN);
  
  const data: ChannelData = {
    channel,
    settings: {},
  };
  
  await upsertFile(
    env.GITHUB_DATA_REPO,
    path,
    JSON.stringify(data, null, 2),
    `Update channel ${channel.id}`,
    env.GITHUB_REPO_TOKEN,
    existing?.sha
  );
}

// 获取频道配置
export async function getChannelConfig(
  env: Env,
  channelId: string
): Promise<ChannelData | null> {
  const path = `data/channels/${channelId}.json`;
  const existing = await getFile(env.GITHUB_DATA_REPO, path, env.GITHUB_REPO_TOKEN);
  
  if (!existing) {
    return null;
  }
  
  try {
    return JSON.parse(existing.content);
  } catch {
    return null;
  }
}
