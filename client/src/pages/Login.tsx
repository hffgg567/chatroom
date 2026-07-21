import { useAuth } from '../contexts/AuthContext';
import './Login.css';

export default function Login() {
  const { login, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="login-loading">
        <div className="spinner"></div>
        <p>加载中...</p>
      </div>
    );
  }

  if (user) {
    window.location.href = '/';
    return null;
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <svg width="48" height="48" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="6" fill="#5865F2"/>
              <path d="M8 10L14 14L8 18" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 18H20" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="login-title">CloudChat</h1>
          <p className="login-subtitle">基于 Cloudflare 的开源聊天室</p>
        </div>

        <div className="login-content">
          <h2 className="login-heading">欢迎回来</h2>
          <p className="login-description">
            使用 GitHub 账号登录，与朋友畅聊
          </p>

          <button onClick={login} className="btn-github">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
            </svg>
            <span>使用 GitHub 登录</span>
          </button>

          <div className="login-divider">
            <span>或</span>
          </div>

          <p className="login-note">
            登录即表示你同意我们的服务条款和隐私政策
          </p>
        </div>

        <div className="login-footer">
          <div className="login-features">
            <div className="feature">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 1L2 6v8l8 5 8-5V6L10 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M10 11v4M10 7v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span>实时聊天</span>
            </div>
            <div className="feature">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="2" y="5" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M6 9h8M6 13h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span>文件分享</span>
            </div>
            <div className="feature">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M3 10h14M10 3l7 7-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>全球加速</span>
            </div>
          </div>
        </div>
      </div>

      {/* Background decoration */}
      <div className="login-bg">
        <div className="login-bg-gradient"></div>
        <div className="login-bg-grid"></div>
      </div>
    </div>
  );
}
