import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import './Header.css';

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: string;
  pinned: boolean;
  created_at: number;
}

export default function Header() {
  const { user, logout } = useAuth();
  
  const { data: pinnedAnnouncements = [] } = useQuery<Announcement[]>({
    queryKey: ['announcements', 'pinned'],
    queryFn: () => api.get('/announcements/pinned'),
    refetchInterval: 60000,
  });

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
    return date.toLocaleDateString('zh-CN');
  };

  const getPriorityClass = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'priority-urgent';
      case 'high': return 'priority-high';
      case 'normal': return 'priority-normal';
      default: return 'priority-low';
    }
  };

  return (
    <header className="header">
      <div className="header-left">
        <Link to="/announcements" className="header-link">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 1L2 5v8l7 4 7-4V5L9 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
          公告
        </Link>
      </div>

      {/* Announcements Banner */}
      {pinnedAnnouncements.length > 0 && (
        <div className="header-announcements">
          {pinnedAnnouncements.slice(0, 1).map(ann => (
            <div key={ann.id} className={`announcement-banner ${getPriorityClass(ann.priority)}`}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              <span className="announcement-title">{ann.title}</span>
              <span className="announcement-time">{formatTime(ann.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="header-right">
        <div className="header-user">
          <img
            src={user?.avatar_url || '/default-avatar.png'}
            alt={user?.username}
            className="header-avatar"
          />
          <span className="header-username">{user?.display_name || user?.username}</span>
          {user?.role === 'admin' && (
            <span className="header-badge">管理员</span>
          )}
        </div>
        <button onClick={logout} className="header-logout btn btn-ghost">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M6 15H3a1 1 0 01-1-1V4a1 1 0 011-1h3M12 13l4-4-4-4M7 9h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </header>
  );
}
