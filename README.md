# CloudChat

基于 Cloudflare 的开源聊天室，使用 GitHub 私有仓库存储聊天数据。

## 功能特性

### ✅ 核心功能
- **GitHub OAuth 登录** - 安全便捷的认证方式
- **实时聊天** - 支持文字、图片、文件消息
- **频道管理** - 创建、加入、离开公开或私密频道
- **成员管理** - 查看频道成员、角色权限
- **文件上传** - 支持多种文件格式上传

### ✅ 管理功能
- **用户管理** - 封禁/解封、禁言/解除禁言
- **频道管理** - 创建、删除、清空聊天记录
- **公告系统** - 发布、置顶、优先级公告
- **操作日志** - 完整的审计追踪

### 🔄 后期计划
- [ ] 邮箱/密码登录
- [ ] 桌面客户端 (Electron)
- [ ] 移动客户端
- [ ] 消息搜索
- [ ] 私聊功能
- [ ] WebSocket 实时推送

## 技术架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    用户浏览器    │────▶│  Cloudflare     │────▶│   GitHub 私有   │
│                 │◀────│   Workers       │◀────│     仓库        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
              ┌─────┴─────┐          ┌─────┴─────┐
              │    D1     │          │    KV     │
              │  (数据库)  │          │  (缓存)   │
              └───────────┘          └───────────┘
```

## 快速开始

### 前置要求
- Node.js 18+
- npm 或 pnpm
- Cloudflare 账号
- GitHub OAuth App
- GitHub 私有仓库 (用于存储数据)

### 1. 克隆项目

```bash
git clone https://github.com/YOUR_USERNAME/cloudchat.git
cd cloudchat
```

### 2. 安装依赖

```bash
# 安装后端依赖
npm install

# 安装前端依赖
cd client && npm install && cd ..
```

### 3. 配置 Cloudflare

#### 创建 D1 数据库
```bash
wrangler d1 create cloudchat
# 复制返回的 database_id 到 wrangler.toml
```

#### 创建 KV 命名空间
```bash
wrangler kv:namespace create CACHE
# 复制返回的 id 到 wrangler.toml
```

#### 创建 R2 存储桶
```bash
wrangler r2 bucket create cloudchat-files
```

#### 配置 GitHub OAuth App
1. 前往 [GitHub Developer Settings](https://github.com/settings/developers)
2. 创建新的 OAuth App
3. 设置回调 URL: `https://your-app.workers.dev/api/auth/github/callback`

### 4. 配置环境变量

创建 `wrangler.toml` 并填入:
```toml
name = "cloudchat"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "cloudchat"
database_id = "your-d1-database-id"

[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-namespace-id"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "cloudchat-files"

[vars]
GITHUB_CLIENT_ID = "your-github-client-id"
APP_URL = "https://your-app.workers.dev"
```

设置密钥:
```bash
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put GITHUB_REPO_TOKEN
wrangler secret put JWT_SECRET
wrangler secret put ENCRYPTION_KEY
```

### 5. 初始化数据库

```bash
npm run db:migrate
```

### 6. 部署

```bash
npm run deploy
```

## 项目结构

```
cloudchat/
├── src/                    # 后端代码
│   ├── index.ts           # 入口文件
│   ├── routes/            # API 路由
│   ├── services/          # 业务逻辑
│   ├── middleware/       # 中间件
│   └── types/            # 类型定义
├── client/                # 前端代码
│   ├── src/
│   │   ├── components/   # React 组件
│   │   ├── pages/        # 页面
│   │   ├── contexts/     # Context providers
│   │   └── lib/          # 工具函数
│   └── package.json
├── migrations/            # 数据库迁移
├── SPEC.md               # 设计规范
└── README.md
```

## 配置说明

### GitHub 私有仓库

需要创建一个私有仓库用于存储聊天数据，设置环境变量:
- `GITHUB_REPO_TOKEN`: 具有 repo 权限的 GitHub Personal Access Token
- `GITHUB_DATA_REPO`: 仓库名称，格式: `username/repo`

### 存储限制

| 类型 | 限制 | 存储位置 |
|------|------|----------|
| 单文件大小 | 50MB | GitHub |
| 消息历史 | 永久 | GitHub |
| 用户数据 | - | D1 |
| 会话缓存 | - | KV |

## API 文档

### 认证
- `GET /api/auth/github` - GitHub 登录
- `GET /api/auth/github/callback` - OAuth 回调
- `POST /api/auth/logout` - 登出
- `GET /api/auth/me` - 当前用户

### 频道
- `GET /api/channels` - 获取我的频道
- `POST /api/channels` - 创建频道
- `GET /api/channels/:id` - 频道详情
- `POST /api/channels/:id/join` - 加入频道
- `POST /api/channels/:id/leave` - 离开频道

### 消息
- `GET /api/messages/channels/:id` - 获取消息
- `POST /api/messages/channels/:id` - 发送消息

### 管理 (需 admin 权限)
- `GET /api/admin/users` - 用户列表
- `POST /api/admin/users/:id/ban` - 封禁用户
- `POST /api/admin/channels/:id/clear` - 清空消息
- `POST /api/admin/announcements` - 发布公告

## 开发

### 本地开发

```bash
# 启动后端 (带热重载)
npm run dev

# 启动前端
cd client && npm run dev
```

### 类型检查

```bash
npm run typecheck
```

## 部署

### Cloudflare Workers

```bash
# 部署到生产环境
npm run deploy

# 查看日志
wrangler tail
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License
