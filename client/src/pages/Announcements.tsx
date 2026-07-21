import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import './Announcements.css';

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  pinned: boolean;
  author_name: string;
  author_avatar: string | null;
  created_at: number;
}

export default function Announcements() {
  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ['announcements'],
    queryFn: () => api.get('/announcements'),
  });

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'urgent': return '紧急';
      case 'high': return '重要';
      case 'normal': return '普通';
      case 'low': return '低';
      default: return '普通';
    }
  };

  const getPriorityClass = (priority: string) => {
    return `priority-${priority}`;
  };

  return (
    <div className="announcements-page">
      <div className="announcements-header">
        <Link to="/" className="announcements-back">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          返回
        </Link>
        <h1>公告</h1>
      </div>

      <div className="announcements-content">
        {isLoading ? (
          <div className="announcements-loading">
            <div className="spinner"></div>
          </div>
        ) : announcements.length === 0 ? (
          <div className="announcements-empty">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path d="M24 4L6 14v20l18 10 18-10V14L24 4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M24 24v10M24 38v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <p>暂无公告</p>
          </div>
        ) : (
          <div className="announcements-list">
            {announcements.map(ann => (
              <article key={ann.id} className="announcement-card">
                <header className="announcement-header">
                  <div className="announcement-meta">
                    <span className={`badge ${getPriorityClass(ann.priority)}`}>
                      {getPriorityLabel(ann.priority)}
                    </span>
                    {ann.pinned && <span className="badge badge-primary">置顶</span>}
                  </div>
                  <h2 className="announcement-title">{ann.title}</h2>
                  <div className="announcement-author">
                    <img 
                      src={ann.author_avatar || '/default-avatar.png'}
                      alt={ann.author_name}
                      className="author-avatar"
                    />
                    <span>{ann.author_name}</span>
                    <span className="separator">·</span>
                    <time>{formatTime(ann.created_at)}</time>
                  </div>
                </header>
                <div className="announcement-body">
                  {ann.content.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
