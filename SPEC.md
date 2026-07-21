# CloudChat - 基于 Cloudflare 的开源聊天室

## 1. 项目概述

**项目名称**: CloudChat  
**项目类型**: 分布式实时聊天室  
**核心功能**: 开源聊天室，支持 GitHub OAuth 登录，基于 Cloudflare Workers 构建，聊天数据存储在 GitHub 私有仓库，通过 Cloudflare 全球加速访问。

### 技术栈

| 层级 | 技术方案 |
|------|----------|
| 前端 | React 18 + TypeScript + Vite |
| 后端 | Cloudflare Workers (Hono框架) |
| 数据库 | Cloudflare D1 (用户、群组数据) |
| KV存储 | Cloudflare KV (会话token、缓存) |
| 对象存储 | GitHub 私有仓库 (聊天记录、文件) |
| CDN加速 | Cloudflare Workers (代理GitHub内容) |
| 认证 | GitHub OAuth 2.0 |

### 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户浏览器                              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare 全球网络                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Workers (前端/API)                     │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │   │
│  │  │  认证   │  │  聊天   │  │  文件   │  │  管理   │    │   │
│  │  │  模块   │  │  模块   │  │  模块   │  │  模块   │    │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │              │              │              │         │
│         ▼              ▼              ▼              ▼         │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐    │
│  │    D1    │   │   KV     │   │   R2     │   │  Workers │    │
│  │ (用户/群) │   │ (Token)  │   │ (临时)   │   │  代理    │    │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub 私有仓库                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  chat-data/    │  │  files/         │  │  media/         │  │
│  │  - channels/    │  │  - 2026/        │  │  - avatars/     │  │
│  │  - messages/    │  │  - attachments/ │  │  - uploads/     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 数据库设计

### D1 数据库 Schema

```sql
-- 用户表
CREATE TABLE users (
  id TEXT PRIMARY KEY,              -- GitHub User ID
  github_id INTEGER UNIQUE NOT NULL, -- GitHub ID
  username TEXT NOT NULL,            -- GitHub Login
  display_name TEXT,                 -- 显示名称
  avatar_url TEXT,                   -- 头像 URL
  email TEXT,                        -- 邮箱 (可选)
  role TEXT DEFAULT 'user',          -- user | admin
  status TEXT DEFAULT 'active',      -- active | banned
  mute_until INTEGER,                -- 禁言截止时间戳
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- 群组表
CREATE TABLE channels (
  id TEXT PRIMARY KEY,               -- 群组唯一ID
  name TEXT NOT NULL,                -- 群组名称
  description TEXT,                  -- 群组描述
  owner_id TEXT NOT NULL,            -- 创建者 GitHub ID
  is_private INTEGER DEFAULT 0,      -- 是否私密群组
  max_members INTEGER DEFAULT 500,   -- 最大成员数
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (owner_id) REFERENCES users(github_id)
);

-- 群组成员表
CREATE TABLE channel_members (
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',         -- owner | admin | member
  joined_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (channel_id, user_id),
  FOREIGN KEY (channel_id) REFERENCES channels(id),
  FOREIGN KEY (user_id) REFERENCES users(github_id)
);

-- 系统通知表
CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',     -- low | normal | high | urgent
  pinned INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

-- 操作日志表
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
```

---

## 3. GitHub 仓库存储结构

### 存储策略

```
GitHub 私有仓库 (cloudchat-data)
├── data/
│   ├── channels/                    # 群组配置
│   │   ├── {channel_id}.json
│   │   └── index.json              # 群组索引
│   ├── messages/                   # 聊天记录
│   │   └── {channel_id}/
│   │       ├── 2026-07.json        # 按年月分文件
│   │       └── index.json          # 消息索引
│   └── users/                      # 用户数据
│       ├── profiles/
│       │   └── {user_id}.json
│       └── index.json
├── files/                          # 用户上传文件
│   ├── {year}/
│   │   └── {month}/
│   │       └── {uuid}.{ext}
└── media/                         # 媒体文件
    ├── avatars/
    │   └── {user_id}.{ext}
    └── attachments/
        └── {message_id}/
            └── {filename}
```

### 存储限制

| 类型 | 限制 | 存储位置 |
|------|------|----------|
| 单文件大小 | 50MB | GitHub |
| 总存储 | 无限制 | GitHub |
| 消息历史 | 永久保留 | GitHub |
| 头像 | 5MB | GitHub + CF R2 |

---

## 4. API 设计

### 认证相关

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/auth/github` | GET | GitHub OAuth 登录入口 |
| `/api/auth/github/callback` | GET | GitHub OAuth 回调处理 |
| `/api/auth/logout` | POST | 登出 |
| `/api/auth/me` | GET | 获取当前用户信息 |

### 聊天相关

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/channels` | GET | 获取频道列表 |
| `/api/channels` | POST | 创建频道 |
| `/api/channels/:id` | GET | 获取频道详情 |
| `/api/channels/:id` | PUT | 更新频道 |
| `/api/channels/:id` | DELETE | 删除频道 |
| `/api/channels/:id/messages` | GET | 获取消息历史 |
| `/api/channels/:id/messages` | POST | 发送消息 |
| `/api/channels/:id/members` | GET | 获取成员列表 |
| `/api/channels/:id/join` | POST | 加入频道 |
| `/api/channels/:id/leave` | POST | 离开频道 |

### 文件相关

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/files/upload` | POST | 上传文件 |
| `/api/files/:id` | GET | 获取文件(通过CF加速) |
| `/api/files/:id/raw` | GET | 直接获取文件 |

### 管理相关

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/admin/users` | GET | 用户列表 |
| `/api/admin/users/:id/ban` | POST | 封禁用户 |
| `/api/admin/users/:id/unban` | POST | 解封用户 |
| `/api/admin/users/:id/mute` | POST | 禁言用户 |
| `/api/admin/channels` | GET | 全部频道 |
| `/api/admin/channels/:id/clear` | POST | 清空聊天记录 |
| `/api/admin/announcements` | GET | 通知列表 |
| `/api/admin/announcements` | POST | 发布通知 |
| `/api/admin/announcements/:id` | DELETE | 删除通知 |
| `/api/admin/logs` | GET | 操作日志 |

---

## 5. 前端界面设计

### 页面结构

```
/
├── /login              # 登录页
├── /dashboard          # 主界面
│   ├── /channels/:id   # 频道视图
│   ├── /settings       # 设置页
│   └── /profile/:id    # 个人资料
├── /admin              # 管理后台
│   ├── /users          # 用户管理
│   ├── /channels       # 频道管理
│   ├── /announcements   # 通知管理
│   └── /logs           # 日志查看
└── /announcements      # 公告页
```

### UI 设计规范

**配色方案**:
- 主色: #5865F2 (Discord 蓝紫色)
- 次色: #4752C4
- 背景: #313338 (深灰)
- 侧边栏: #2B2D31
- 文字主色: #F2F3F5
- 文字次色: #B5BAC1
- 成功: #23A55A
- 警告: #F0B232
- 错误: #DA373C

**字体**:
- 主字体: Inter, -apple-system, sans-serif
- 代码字体: JetBrains Mono, monospace

**间距系统**: 4px 基准网格

**组件规范**:
- 圆角: 4px (按钮), 8px (卡片), 16px (模态框)
- 阴影: 0 8px 16px rgba(0,0,0,0.24)

### 主要组件

1. **频道列表** - 左侧边栏
2. **聊天窗口** - 消息显示区
3. **消息输入框** - 支持 Markdown、@提及、文件上传
4. **用户列表** - 在线成员
5. **通知弹窗** - 系统通知
6. **管理面板** - Admin Dashboard

---

## 6. 功能列表

### 基础功能

- [x] GitHub OAuth 登录
- [x] 邮箱密码登录 (可选)
- [x] 创建/加入/退出群组
- [x] 发送文字消息
- [x] 发送文件/图片
- [x] @提及用户
- [x] 消息时间戳显示
- [x] 未读消息计数
- [x] 用户在线状态

### 高级功能

- [x] 消息搜索
- [x] 私聊功能
- [x] 消息回复/引用
- [x] Markdown 支持
- [x] 代码高亮
- [x] 表情反应

### 管理功能

- [x] 创建/删除群组
- [x] 修改群组信息
- [x] 清空聊天记录
- [x] 封禁/解封用户
- [x] 禁言/解除禁言
- [x] 发布系统通知
- [x] 操作日志审计

### 客户端功能 (后期)

- [ ] Windows/macOS/Linux 桌面客户端
- [ ] iOS/Android 移动客户端
- [ ] 离线消息同步
- [ ] 推送通知

---

## 7. 安全性设计

### 认证与授权

1. **JWT Token** - 短期访问令牌 (24h)
2. **Refresh Token** - KV 存储，长期有效
3. **CSP 策略** - 严格的内容安全策略
4. **CORS** - 仅允许 Cloudflare 域名

### 数据安全

1. **传输加密** - HTTPS (强制)
2. **GitHub Token** - 仅服务端使用
3. **用户密码** - bcrypt 哈希 (邮箱登录)
4. **敏感操作** - 需要二次确认

### 速率限制

| 端点 | 限制 |
|------|------|
| 消息发送 | 10条/分钟 |
| 文件上传 | 5次/分钟 |
| 登录尝试 | 5次/5分钟 |
| API 请求 | 100次/分钟 |

---

## 8. 部署配置

### Cloudflare Workers 配置

```javascript
// wrangler.toml
name = "cloudchat"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "cloudchat"
database_id = "xxx"

[[kv_namespaces]]
binding = "CACHE"
id = "xxx"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "cloudchat-files"
```

### 环境变量

```
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GITHUB_REPO_TOKEN=xxx       # GitHub PAT for data repo
GITHUB_DATA_REPO=xxx        # Data repository name
JWT_SECRET=xxx
ENCRYPTION_KEY=xxx
```

---

## 9. 项目结构

```
cloudchat/
├── src/
│   ├── index.ts              # 入口文件
│   ├── routes/
│   │   ├── auth.ts           # 认证路由
│   │   ├── channels.ts       # 频道路由
│   │   ├── messages.ts       # 消息路由
│   │   ├── files.ts          # 文件路由
│   │   └── admin.ts          # 管理路由
│   ├── services/
│   │   ├── github.ts         # GitHub API
│   │   ├── storage.ts        # GitHub Storage
│   │   ├── auth.ts           # 认证服务
│   │   └── cache.ts          # KV 缓存
│   ├── middleware/
│   │   ├── auth.ts           # 认证中间件
│   │   ├── rateLimit.ts      # 限流
│   │   └── admin.ts          # 管理员检查
│   ├── db/
│   │   ├── schema.ts         # D1 Schema
│   │   └── queries.ts        # 数据库查询
│   └── utils/
│       ├── crypto.ts         # 加密工具
│       └── response.ts       # 响应封装
├── public/
│   ├── index.html
│   └── assets/
├── client/                   # React 前端
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   ├── components/
│   │   └── hooks/
│   └── package.json
├── migrations/
│   └── 001_init.sql
├── wrangler.toml
├── package.json
└── README.md
```

---

## 10. 开发计划

### Phase 1: 核心框架
- [x] 项目初始化
- [x] 数据库配置
- [x] GitHub OAuth
- [x] 基础聊天功能

### Phase 2: 存储层
- [x] GitHub API 封装
- [x] 消息存储
- [x] 文件上传/下载
- [x] CF 加速代理

### Phase 3: 前端
- [x] React 界面
- [x] 频道列表
- [x] 消息显示
- [x] 成员列表
- [x] 公告页面
- [x] 管理后台

### Phase 4: 管理功能
- [x] Admin Dashboard
- [x] 用户管理
- [x] 频道管理
- [x] 通知系统

### Phase 5: 客户端 (后期)
- [ ] Electron 桌面端
- [ ] 移动端适配
