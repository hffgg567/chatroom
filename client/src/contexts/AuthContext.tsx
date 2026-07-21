import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface User {
  id: string;
  github_id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  email?: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'banned';
  created_at: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: () => void;
  logout: () => void;
  updateUser: (data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'cloudchat_token';
const REFRESH_KEY = 'cloudchat_refresh';
const USER_KEY = 'cloudchat_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 初始化 - 从 localStorage 恢复登录状态
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedUser = localStorage.getItem(USER_KEY);
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem(USER_KEY);
      }
    }
    
    setLoading(false);
  }, []);

  // 处理 OAuth 回调
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const oauthToken = urlParams.get('token');
    const refreshToken = urlParams.get('refresh');
    const userData = urlParams.get('user');
    
    if (oauthToken && userData) {
      try {
        const userObj = JSON.parse(decodeURIComponent(userData));
        setToken(oauthToken);
        setUser(userObj);
        localStorage.setItem(TOKEN_KEY, oauthToken);
        if (refreshToken) {
          localStorage.setItem(REFRESH_KEY, refreshToken);
        }
        localStorage.setItem(USER_KEY, userData);
        
        // 清除 URL 参数
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (err) {
        console.error('Failed to parse user data:', err);
      }
    }
  }, []);

  const login = useCallback(() => {
    window.location.href = '/api/auth/github';
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  const updateUser = useCallback((data: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...data } : null);
    const currentUser = user ? { ...user, ...data } : null;
    if (currentUser) {
      localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
