import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import './Sidebar.css';

interface Channel {
  id: string;
  name: string;
  description?: string;
  is_private: boolean;
  member_count: number;
}

export default function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();
  
  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: () => api.get('/channels'),
    refetchInterval: 30000,
  });

  const publicChannels = channels.filter(c => !c.is_private);
  const privateChannels = channels.filter(c => c.is_private);

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-header">
        <Link to="/" className="sidebar-logo">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="#5865F2"/>
            <path d="M8 10L14 14L8 18" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 18H20" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span>CloudChat</span>
        </Link>
      </div>

      {/* Channels */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span>公开频道</span>
          <Link to="/channels/new" className="sidebar-add-btn" title="创建频道">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </Link>
        </div>
        <nav className="sidebar-channels">
          {publicChannels.map(channel => (
            <Link
              key={channel.id}
              to={`/channels/${channel.id}`}
              className={`sidebar-channel ${location.pathname === `/channels/${channel.id}` ? 'active' : ''}`}
            >
              <span className="channel-icon">#</span>
              <span className="channel-name">{channel.name}</span>
            </Link>
          ))}
          {publicChannels.length === 0 && (
            <div className="sidebar-empty">暂无公开频道</div>
          )}
        </nav>
      </div>

      {/* Private Channels */}
      {privateChannels.length > 0 && (
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span>私密频道</span>
          </div>
          <nav className="sidebar-channels">
            {privateChannels.map(channel => (
              <Link
                key={channel.id}
                to={`/channels/${channel.id}`}
                className={`sidebar-channel ${location.pathname === `/channels/${channel.id}` ? 'active' : ''}`}
              >
                <span className="channel-icon">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="2" y="3" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    <path d="M5 3V2a2 2 0 014 0v1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  </svg>
                </span>
                <span className="channel-name">{channel.name}</span>
              </Link>
            ))}
          </nav>
        </div>
      )}

      {/* User Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <img
            src={user?.avatar_url || '/default-avatar.png'}
            alt={user?.username}
            className="sidebar-avatar"
          />
          <div className="sidebar-user-info">
            <span className="sidebar-username">{user?.display_name || user?.username}</span>
            <span className="sidebar-userid">#{user?.username}</span>
          </div>
        </div>
        <div className="sidebar-actions">
          <Link to="/settings" className="sidebar-action-btn" title="设置">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.22 3.22l1.42 1.42M13.36 13.36l1.42 1.42M3.22 14.78l1.42-1.42M13.36 4.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </Link>
          {user?.role === 'admin' && (
            <Link to="/admin" className="sidebar-action-btn" title="管理后台">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 1L2 5v8l7 4 7-4V5L9 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M9 7v4M9 13v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
