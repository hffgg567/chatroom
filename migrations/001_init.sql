-- CloudChat D1 数据库初始化 Schema
-- 创建日期: 2026-07-15

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,              -- 用户唯一ID
  github_id INTEGER UNIQUE NOT NULL, -- GitHub User ID
  username TEXT NOT NULL,            -- GitHub 用户名
  display_name TEXT,                 -- 显示名称
  avatar_url TEXT,                   -- 头像 URL
  email TEXT,                        -- 邮箱 (可选)
  role TEXT DEFAULT 'user',          -- user | admin
  status TEXT DEFAULT 'active',       -- active | banned
  mute_until INTEGER,                -- 禁言截止时间戳 (毫秒)
  github_token TEXT,                 -- GitHub OAuth Token (加密存储)
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- 群组表
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,               -- 群组唯一ID (nanoid)
  name TEXT NOT NULL,                -- 群组名称
  description TEXT,                  -- 群组描述
  owner_id TEXT NOT NULL,            -- 创建者 GitHub ID
  is_private INTEGER DEFAULT 0,      -- 是否私密群组
  is_default INTEGER DEFAULT 0,      -- 是否默认公开群组
  max_members INTEGER DEFAULT 500,   -- 最大成员数
  avatar_url TEXT,                   -- 群组头像
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- 群组成员表
CREATE TABLE IF NOT EXISTS channel_members (
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',         -- owner | admin | member
  nickname TEXT,                      -- 群内昵称
  joined_at INTEGER DEFAULT (unixepoch()),
  last_read_at INTEGER,              -- 最后阅读消息时间
  PRIMARY KEY (channel_id, user_id),
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(github_id) ON DELETE CASCADE
);

-- 私信表 (一对一聊天)
CREATE TABLE IF NOT EXISTS direct_messages (
  id TEXT PRIMARY KEY,
  user1_id TEXT NOT NULL,
  user2_id TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user1_id) REFERENCES users(github_id) ON DELETE CASCADE,
  FOREIGN KEY (user2_id) REFERENCES users(github_id) ON DELETE CASCADE
);

-- 系统通知表
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',     -- low | normal | high | urgent
  pinned INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (author_id) REFERENCES users(github_id) ON DELETE CASCADE
);

-- 操作日志表 (审计)
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,                   -- user | channel | announcement
  target_id TEXT,
  details TEXT,                        -- JSON 格式的详细信息
  ip_address TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (actor_id) REFERENCES users(github_id) ON DELETE CASCADE
);

-- 在线用户表 (用于实时显示)
CREATE TABLE IF NOT EXISTS online_users (
  user_id TEXT PRIMARY KEY,
  last_seen INTEGER DEFAULT (unixepoch()),
  socket_id TEXT,                     -- WebSocket 连接 ID
  FOREIGN KEY (user_id) REFERENCES users(github_id) ON DELETE CASCADE
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_channels_owner ON channels(owner_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
