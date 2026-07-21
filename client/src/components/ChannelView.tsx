import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import './ChannelView.css';

interface Channel {
  id: string;
  name: string;
  description?: string;
}

interface Message {
  id: string;
  channel_id: string;
  user_id: number;
  username: string;
  avatar_url: string | null;
  content: string;
  type: 'text' | 'file' | 'image' | 'system';
  metadata?: {
    file_name?: string;
    file_size?: number;
    file_url?: string;
    file_type?: string;
    width?: number;
    height?: number;
  };
  reply_to?: string | null;
  mentions?: number[];
  reactions?: Record<string, number[]>;
  created_at: number;
  updated_at: number;
}

interface Member {
  user_id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  joined_at: number;
}

export default function ChannelView({ channel }: { channel: Channel }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('');
  const [showMembers, setShowMembers] = useState(true);
  
  // 获取消息
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['messages', channel.id],
    queryFn: () => api.get(`/messages/channels/${channel.id}`, { limit: 50 }),
    refetchInterval: 5000, // 每5秒刷新
  });
  
  // 获取成员
  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ['channel-members', channel.id],
    queryFn: () => api.get(`/channels/${channel.id}/members`),
  });
  
  // 发送消息
  const sendMessage = useMutation({
    mutationFn: (content: string) => 
      api.post(`/messages/channels/${channel.id}`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', channel.id] });
      setMessage('');
      scrollToBottom();
    },
  });
  
  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  
  // 处理发送
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !sendMessage.isPending) {
      sendMessage.mutate(message.trim());
    }
  };
  
  // 格式化消息内容 (支持基本 Markdown)
  const formatContent = (content: string) => {
    // 转义 HTML
    let formatted = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // 粗体 **text**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // 斜体 *text*
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // 代码 `code`
    formatted = formatted.replace(/`(.*?)`/g, '<code>$1</code>');
    
    // 链接
    formatted = formatted.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    
    // @提及
    formatted = formatted.replace(
      /@(\w+)/g,
      '<span class="mention">@$1</span>'
    );
    
    return formatted;
  };

  return (
    <div className="channel-view">
      {/* Channel Header */}
      <div className="channel-header">
        <div className="channel-header-left">
          <span className="channel-header-icon">#</span>
          <h2 className="channel-header-name">{channel.name}</h2>
          {channel.description && (
            <span className="channel-header-desc">{channel.description}</span>
          )}
        </div>
        <div className="channel-header-right">
          <button 
            className={`channel-header-btn ${showMembers ? 'active' : ''}`}
            onClick={() => setShowMembers(!showMembers)}
            title="成员列表"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="7" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M2 17c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="14" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M16 16c0-2.2-1-4-2.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="channel-content">
        {/* Messages Area */}
        <div className="channel-messages">
          <div className="messages-container">
            {messages.length === 0 ? (
              <div className="messages-empty">
                <p>还没有消息，发送第一条消息吧！</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`message ${msg.type === 'system' ? 'message-system' : ''}`}>
                  {msg.type !== 'system' && (
                    <img
                      src={msg.avatar_url || '/default-avatar.png'}
                      alt={msg.username}
                      className="message-avatar"
                    />
                  )}
                  <div className="message-content">
                    <div className="message-header">
                      <span className="message-username">{msg.username}</span>
                      <span className="message-time">{formatTime(msg.created_at)}</span>
                    </div>
                    {msg.type === 'system' ? (
                      <p className="message-text message-text-system">{msg.content}</p>
                    ) : msg.type === 'image' ? (
                      <div className="message-image">
                        <img src={msg.metadata?.file_url} alt={msg.content} />
                      </div>
                    ) : msg.type === 'file' ? (
                      <div className="message-file">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <path d="M12 2H5a1 1 0 00-1 1v14a1 1 0 001 1h10a1 1 0 001-1V6l-4-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                          <path d="M12 2v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        </svg>
                        <a href={msg.metadata?.file_url} target="_blank" rel="noopener noreferrer">
                          {msg.metadata?.file_name || msg.content}
                        </a>
                        {msg.metadata?.file_size && (
                          <span className="message-file-size">
                            {formatFileSize(msg.metadata.file_size)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p 
                        className="message-text"
                        dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
                      />
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Members Sidebar */}
        {showMembers && (
          <div className="channel-members">
            <div className="members-header">
              <span>成员 ({members.length})</span>
            </div>
            <div className="members-list">
              {members.map((member) => (
                <div key={member.user_id} className="member-item">
                  <img
                    src={member.avatar_url || '/default-avatar.png'}
                    alt={member.username}
                    className="member-avatar"
                  />
                  <div className="member-info">
                    <span className="member-name">
                      {member.display_name || member.username}
                      {member.user_id === user?.github_id && ' (你)'}
                    </span>
                    <span className="member-role">@{member.username}</span>
                  </div>
                  {member.role === 'owner' && (
                    <span className="member-badge owner">创建者</span>
                  )}
                  {member.role === 'admin' && (
                    <span className="member-badge admin">管理员</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Message Input */}
      <div className="channel-input">
        <form onSubmit={handleSend} className="input-form">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`#${channel.name} 中发送消息...`}
            className="input-message"
            disabled={sendMessage.isPending}
          />
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={!message.trim() || sendMessage.isPending}
          >
            发送
          </button>
        </form>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
