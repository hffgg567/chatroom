import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import './Admin.css';

interface User {
  id: string;
  github_id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  status: string;
  mute_until: number | null;
  created_at: number;
}

interface Channel {
  id: string;
  name: string;
  owner_name: string;
  member_count: number;
  created_at: number;
}

interface Stats {
  users: number;
  channels: number;
  banned: number;
  online: number;
  activeThisWeek: number;
}

type Tab = 'overview' | 'users' | 'channels' | 'announcements';

export default function Admin() {
  const [tab, setTab] = useState<Tab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();
  
  // 获取统计数据
  const { data: stats } = useQuery<Stats>({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/admin/stats'),
  });
  
  // 获取用户列表
  const { data: usersData, isLoading: usersLoading } = useQuery<{ users: User[]; total: number }>({
    queryKey: ['admin-users', searchQuery],
    queryFn: () => api.get('/admin/users', { search: searchQuery, limit: 50 }),
    enabled: tab === 'users',
  });
  
  // 获取频道列表
  const { data: channels = [], isLoading: channelsLoading } = useQuery<Channel[]>({
    queryKey: ['admin-channels'],
    queryFn: () => api.get('/admin/channels'),
    enabled: tab === 'channels',
  });
  
  // 操作 mutations
  const banUser = useMutation({
    mutationFn: (userId: number) => api.post(`/admin/users/${userId}/ban`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });
  
  const unbanUser = useMutation({
    mutationFn: (userId: number) => api.post(`/admin/users/${userId}/unban`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });
  
  const muteUser = useMutation({
    mutationFn: ({ userId, duration }: { userId: number; duration: number }) => 
      api.post(`/admin/users/${userId}/mute`, { duration }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });
  
  const deleteChannel = useMutation({
    mutationFn: (channelId: string) => api.delete(`/admin/channels/${channelId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-channels'] }),
  });
  
  const clearChannel = useMutation({
    mutationFn: (channelId: string) => api.post(`/admin/channels/${channelId}/clear`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-channels'] }),
  });

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatMuteTime = (timestamp: number | null) => {
    if (!timestamp) return '-';
    const now = Date.now();
    if (timestamp < now) return '已过期';
    const remaining = timestamp - now;
    if (remaining < 3600000) return `${Math.floor(remaining / 60000)} 分钟后`;
    if (remaining < 86400000) return `${Math.floor(remaining / 3600000)} 小时后`;
    return `${Math.floor(remaining / 86400000)} 天后`;
  };

  return (
    <div className="admin">
      <div className="admin-header">
        <Link to="/" className="admin-back">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          返回
        </Link>
        <h1 className="admin-title">管理后台</h1>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        <button 
          className={`admin-tab ${tab === 'overview' ? 'active' : ''}`}
          onClick={() => setTab('overview')}
        >
          概览
        </button>
        <button 
          className={`admin-tab ${tab === 'users' ? 'active' : ''}`}
          onClick={() => setTab('users')}
        >
          用户管理
        </button>
        <button 
          className={`admin-tab ${tab === 'channels' ? 'active' : ''}`}
          onClick={() => setTab('channels')}
        >
          频道管理
        </button>
        <button 
          className={`admin-tab ${tab === 'announcements' ? 'active' : ''}`}
          onClick={() => setTab('announcements')}
        >
          公告管理
        </button>
      </div>

      <div className="admin-content">
        {/* Overview Tab */}
        {tab === 'overview' && stats && (
          <div className="admin-overview">
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2"/>
                    <path d="M4 20c0-4 4-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="stat-info">
                  <span className="stat-value">{stats.users}</span>
                  <span className="stat-label">总用户</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 4L4 8v8l8 4 8-4V8L12 4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="stat-info">
                  <span className="stat-value">{stats.channels}</span>
                  <span className="stat-label">总频道</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon online">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2"/>
                    <path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="stat-info">
                  <span className="stat-value">{stats.online}</span>
                  <span className="stat-label">在线用户</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="stat-info">
                  <span className="stat-value">{stats.activeThisWeek}</span>
                  <span className="stat-label">本周活跃</span>
                </div>
              </div>
            </div>
            
            <div className="overview-warn">
              <div className="warn-header">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10 6v4M10 14h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span>注意事项</span>
              </div>
              <ul className="warn-list">
                <li>删除频道会同时删除所有聊天记录</li>
                <li>封禁用户将使其无法登录</li>
                <li>禁言时长设置为 0 将永久禁言</li>
              </ul>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {tab === 'users' && (
          <div className="admin-users">
            <div className="admin-toolbar">
              <input
                type="text"
                placeholder="搜索用户..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input"
              />
            </div>
            
            {usersLoading ? (
              <div className="admin-loading">
                <div className="spinner"></div>
              </div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>用户</th>
                    <th>角色</th>
                    <th>状态</th>
                    <th>禁言</th>
                    <th>注册时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {usersData?.users.map(user => (
                    <tr key={user.github_id}>
                      <td>
                        <div className="user-cell">
                          <img 
                            src={user.avatar_url || '/default-avatar.png'} 
                            alt={user.username}
                            className="user-avatar"
                          />
                          <div>
                            <span className="user-name">{user.display_name || user.username}</span>
                            <span className="user-login">@{user.username}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${user.role === 'admin' ? 'badge-primary' : ''}`}>
                          {user.role === 'admin' ? '管理员' : '用户'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${user.status === 'banned' ? 'badge-danger' : 'badge-success'}`}>
                          {user.status === 'banned' ? '已封禁' : '正常'}
                        </span>
                      </td>
                      <td>{formatMuteTime(user.mute_until ? user.mute_until : null)}</td>
                      <td>{formatTime(user.created_at)}</td>
                      <td>
                        <div className="action-btns">
                          {user.status === 'active' ? (
                            <button 
                              className="btn btn-sm btn-ghost"
                              onClick={() => banUser.mutate(user.github_id)}
                              disabled={user.role === 'admin' || banUser.isPending}
                            >
                              封禁
                            </button>
                          ) : (
                            <button 
                              className="btn btn-sm btn-ghost text-success"
                              onClick={() => unbanUser.mutate(user.github_id)}
                              disabled={unbanUser.isPending}
                            >
                              解封
                            </button>
                          )}
                          <button 
                            className="btn btn-sm btn-ghost text-warning"
                            onClick={() => muteUser.mutate({ userId: user.github_id, duration: 3600000 })}
                            disabled={muteUser.isPending}
                          >
                            禁言1小时
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Channels Tab */}
        {tab === 'channels' && (
          <div className="admin-channels">
            {channelsLoading ? (
              <div className="admin-loading">
                <div className="spinner"></div>
              </div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>频道名称</th>
                    <th>创建者</th>
                    <th>成员数</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map(channel => (
                    <tr key={channel.id}>
                      <td># {channel.name}</td>
                      <td>{channel.owner_name}</td>
                      <td>{channel.member_count}</td>
                      <td>{formatTime(channel.created_at)}</td>
                      <td>
                        <div className="action-btns">
                          <button 
                            className="btn btn-sm btn-ghost text-warning"
                            onClick={() => clearChannel.mutate(channel.id)}
                            disabled={clearChannel.isPending}
                          >
                            清空记录
                          </button>
                          <button 
                            className="btn btn-sm btn-ghost text-danger"
                            onClick={() => {
                              if (confirm('确定删除此频道？此操作不可恢复！')) {
                                deleteChannel.mutate(channel.id);
                              }
                            }}
                            disabled={deleteChannel.isPending}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Announcements Tab */}
        {tab === 'announcements' && (
          <div className="admin-announcements">
            <AnnouncementManager />
          </div>
        )}
      </div>
    </div>
  );
}

// Announcement Manager Component
function AnnouncementManager() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState('normal');
  const [pinned, setPinned] = useState(false);
  const queryClient = useQueryClient();
  
  const createAnnouncement = useMutation({
    mutationFn: () => api.post('/announcements', { title, content, priority, pinned }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      setTitle('');
      setContent('');
      setPriority('normal');
      setPinned(false);
    },
  });
  
  const deleteAnnouncement = useMutation({
    mutationFn: (id: string) => api.delete(`/announcements/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements'] }),
  });

  return (
    <div className="announcement-form">
      <h3>发布公告</h3>
      <div className="form-group">
        <label className="form-label">标题</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input"
          placeholder="公告标题"
        />
      </div>
      <div className="form-group">
        <label className="form-label">内容</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="textarea"
          placeholder="公告内容"
          rows={4}
        />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">优先级</label>
          <select 
            value={priority} 
            onChange={(e) => setPriority(e.target.value)}
            className="input"
          >
            <option value="low">低</option>
            <option value="normal">普通</option>
            <option value="high">高</option>
            <option value="urgent">紧急</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
            />
            置顶公告
          </label>
        </div>
      </div>
      <button 
        className="btn btn-primary"
        onClick={() => createAnnouncement.mutate()}
        disabled={!title.trim() || !content.trim() || createAnnouncement.isPending}
      >
        {createAnnouncement.isPending ? '发布中...' : '发布公告'}
      </button>
    </div>
  );
}
