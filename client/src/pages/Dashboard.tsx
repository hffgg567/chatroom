import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import ChannelView from '../components/ChannelView';
import './Dashboard.css';

interface Channel {
  id: string;
  name: string;
  description?: string;
}

interface PublicChannel {
  id: string;
  name: string;
  description?: string;
  member_count: number;
}

export default function Dashboard() {
  const { channelId } = useParams<{ channelId?: string }>();
  
  const { data: myChannels = [] } = useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: () => api.get('/channels'),
  });

  const { data: publicChannels = [] } = useQuery<PublicChannel[]>({
    queryKey: ['public-channels'],
    queryFn: () => api.get('/channels/public'),
  });

  // 查找当前频道
  const currentChannel = channelId 
    ? myChannels.find(c => c.id === channelId)
    : null;

  if (channelId && currentChannel) {
    return <ChannelView channel={currentChannel} />;
  }

  // 默认视图 - 显示欢迎页和公开频道
  return (
    <div className="dashboard">
      <div className="dashboard-welcome">
        <div className="welcome-icon">
          <svg width="64" height="64" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="#5865F2"/>
            <path d="M8 10L14 14L8 18" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 18H20" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <h1>欢迎使用 CloudChat</h1>
        <p>选择一个频道开始聊天，或加入公开频道</p>
      </div>

      {publicChannels.length > 0 && (
        <div className="dashboard-section">
          <h2 className="dashboard-section-title">公开频道</h2>
          <div className="dashboard-channels">
            {publicChannels.map(channel => (
              <Link
                key={channel.id}
                to={`/channels/${channel.id}`}
                className="channel-card"
              >
                <div className="channel-card-header">
                  <span className="channel-card-icon">#</span>
                  <span className="channel-card-name">{channel.name}</span>
                </div>
                {channel.description && (
                  <p className="channel-card-desc">{channel.description}</p>
                )}
                <div className="channel-card-footer">
                  <span className="channel-card-members">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="5" cy="4" r="2" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M1 12c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <circle cx="10" cy="5" r="2" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M12 12c0-1.7-.8-3.2-2-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    {channel.member_count} 成员
                  </span>
                  <span className="channel-card-join">加入</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="dashboard-section">
        <h2 className="dashboard-section-title">快速链接</h2>
        <div className="dashboard-links">
          <Link to="/announcements" className="quick-link">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2L3 6v8l7 4 7-4V6L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
            <span>公告</span>
          </Link>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="quick-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
            </svg>
            <span>GitHub</span>
          </a>
        </div>
      </div>
    </div>
  );
}
