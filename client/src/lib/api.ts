import { useAuth } from '../contexts/AuthContext';

const API_BASE = '/api';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    return localStorage.getItem('cloudchat_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    
    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });
    
    if (response.status === 401) {
      // Token 过期，尝试刷新
      const refreshed = await this.refreshToken();
      if (refreshed) {
        // 重试请求
        (headers as Record<string, string>)['Authorization'] = `Bearer ${this.getToken()}`;
        const retryResponse = await fetch(`${this.baseUrl}${endpoint}`, {
          ...options,
          headers,
        });
        
        if (!retryResponse.ok) {
          throw await this.handleError(retryResponse);
        }
        
        return retryResponse.json();
      }
      
      // 刷新失败，登出
      localStorage.removeItem('cloudchat_token');
      localStorage.removeItem('cloudchat_refresh');
      localStorage.removeItem('cloudchat_user');
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    
    if (!response.ok) {
      throw await this.handleError(response);
    }
    
    return response.json();
  }

  private async handleError(response: Response): Promise<Error> {
    try {
      const data = await response.json();
      return new Error(data.error || data.message || 'Request failed');
    } catch {
      return new Error(`HTTP ${response.status}`);
    }
  }

  private async refreshToken(): Promise<boolean> {
    const refreshToken = localStorage.getItem('cloudchat_refresh');
    
    if (!refreshToken) {
      return false;
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      
      if (!response.ok) {
        return false;
      }
      
      const data = await response.json();
      localStorage.setItem('cloudchat_token', data.accessToken);
      return true;
    } catch {
      return false;
    }
  }

  // GET 请求
  async get<T>(endpoint: string, params?: Record<string, string | number>): Promise<T> {
    let url = endpoint;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      const query = searchParams.toString();
      if (query) {
        url += `?${query}`;
      }
    }
    return this.request<T>(url, { method: 'GET' });
  }

  // POST 请求
  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // PUT 请求
  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // DELETE 请求
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // 上传文件
  async uploadFile<T>(endpoint: string, file: File, channelId?: string): Promise<T> {
    const token = this.getToken();
    const formData = new FormData();
    formData.append('file', file);
    if (channelId) {
      formData.append('channelId', channelId);
    }
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    
    if (!response.ok) {
      throw await this.handleError(response);
    }
    
    return response.json();
  }
}

export const api = new ApiClient(API_BASE);
