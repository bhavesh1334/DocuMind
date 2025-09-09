const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://documind-backend-u49o.onrender.com/api';

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface DocumentChunk {
  content: string;
  metadata?: any;
}

export interface Document {
  id: string;
  title: string;
  type: 'file' | 'url' | 'text' | 'youtube';
  source?: string;
  status: 'processing' | 'completed' | 'failed';
  summary?: string;
  chunks?: DocumentChunk[];
  metadata: {
    fileSize?: number;
    mimeType?: string;
    originalName?: string;
    size?: number;
    pages?: number;
    wordCount?: number;
    url?: string;
  };
  createdAt: string;
  updatedAt: string;
  error?: string; // Added to handle processing errors
  // Legacy field for backward compatibility
  _id?: string;
  content?: string;
  fileType?: string;
  url?: string;
}

export interface Chat {
  id: string;
  _id?: string; // Legacy field for backward compatibility
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  documentIds: string[];
}

export interface User {
  id: string;
  name: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  _id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    documentId: string;
    title: string;
    relevanceScore: number;
  }>;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// API Error Class
export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Base API Client
class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new ApiError(
          data.message || data.error || 'An error occurred',
          response.status,
          data.code
        );
      }

      return data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      
      // Network or other errors
      throw new ApiError(
        error instanceof Error ? error.message : 'Network error occurred'
      );
    }
  }

  // Document API methods
  async uploadFiles(files: FileList, userId: string, title?: string): Promise<ApiResponse<Document[]>> {
    const formData = new FormData();
    Array.from(files).forEach(file => {
      formData.append('files', file);
    });
    formData.append('userId', userId);
    if (title) formData.append('title', title);

    return this.request<Document[]>('/documents/upload', {
      method: 'POST',
      headers: {}, // Remove Content-Type to let browser set it with boundary
      body: formData,
    });
  }

  async addUrl(url: string, userId: string, title?: string): Promise<ApiResponse<Document>> {
    return this.request<Document>('/documents/url', {
      method: 'POST',
      body: JSON.stringify({ url, title, userId }),
    });
  }

  async addText(text: string, title: string, userId: string): Promise<ApiResponse<Document>> {
    return this.request<Document>('/documents/text', {
      method: 'POST',
      body: JSON.stringify({ content: text, title, userId }),
    });
  }

  async getDocuments(params?: {
    page?: number;
    limit?: number;
    type?: string;
    status?: string;
    userId?: string;
  }): Promise<ApiResponse<{ documents: Document[]; pagination: any }>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.type) searchParams.append('type', params.type);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.userId) searchParams.append('userId', params.userId);

    const query = searchParams.toString();
    return this.request<{ documents: Document[]; pagination: any }>(
      `/documents${query ? `?${query}` : ''}`
    );
  }

  async getDocument(id: string, userId?: string): Promise<ApiResponse<Document>> {
    const searchParams = new URLSearchParams();
    if (userId) searchParams.append('userId', userId);
    const query = searchParams.toString();
    return this.request<Document>(`/documents/${id}${query ? `?${query}` : ''}`);
  }

  async deleteDocument(id: string, userId?: string): Promise<ApiResponse<void>> {
    const searchParams = new URLSearchParams();
    if (userId) searchParams.append('userId', userId);
    const query = searchParams.toString();
    return this.request<void>(`/documents/${id}${query ? `?${query}` : ''}`, {
      method: 'DELETE',
    });
  }

  async getDocumentSummary(userId?: string): Promise<ApiResponse<{
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
  }>> {
    const searchParams = new URLSearchParams();
    if (userId) searchParams.append('userId', userId);
    const query = searchParams.toString();
    return this.request(`/documents/summary${query ? `?${query}` : ''}`);
  }

  // Chat API methods
  async createChat(title: string, userId: string, documentIds?: string[]): Promise<ApiResponse<Chat>> {
    return this.request<Chat>('/chat', {
      method: 'POST',
      body: JSON.stringify({ title, userId, documentIds }),
    });
  }

  async sendMessage(
    message: string,
    userId: string,
    chatId?: string,
    documentIds?: string[]
  ): Promise<ApiResponse<{
    chatId: string;
    isNewChat: boolean;
    userMessage: {
      role: 'user';
      content: string;
      timestamp: string;
    };
    assistantMessage: {
      role: 'assistant';
      content: string;
      timestamp: string;
      metadata?: {
        sources?: Array<{
          documentId: string;
          title: string;
          relevanceScore: number;
        }>;
        retrievedChunks?: any;
        enhancedQuery?: string;
      };
    };
    chat: {
      id: string;
      title: string;
      documentIds: string[];
    };
  }>> {
    return this.request<{
      chatId: string;
      isNewChat: boolean;
      userMessage: {
        role: 'user';
        content: string;
        timestamp: string;
      };
      assistantMessage: {
        role: 'assistant';
        content: string;
        timestamp: string;
        metadata?: {
          sources?: Array<{
            documentId: string;
            title: string;
            relevanceScore: number;
          }>;
          retrievedChunks?: any;
          enhancedQuery?: string;
        };
      };
      chat: {
        id: string;
        title: string;
        documentIds: string[];
      };
    }>('/chat/message', {
      method: 'POST',
      body: JSON.stringify({ message, userId, chatId, documentIds }),
    });
  }

  async getChats(params?: {
    page?: number;
    limit?: number;
    userId?: string;
  }): Promise<ApiResponse<PaginatedResponse<Chat>>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.userId) searchParams.append('userId', params.userId);

    const query = searchParams.toString();
    return this.request<PaginatedResponse<Chat>>(
      `/chat${query ? `?${query}` : ''}`
    );
  }

  async getChat(id: string, userId?: string): Promise<ApiResponse<Chat & { messages: Message[] }>> {
    const searchParams = new URLSearchParams();
    if (userId) searchParams.append('userId', userId);
    const query = searchParams.toString();
    return this.request<Chat & { messages: Message[] }>(`/chat/${id}${query ? `?${query}` : ''}`);
  }

  async getChatHistory(id: string, userId?: string): Promise<ApiResponse<Message[]>> {
    const searchParams = new URLSearchParams();
    if (userId) searchParams.append('userId', userId);
    const query = searchParams.toString();
    return this.request<Message[]>(`/chat/${id}/history${query ? `?${query}` : ''}`);
  }

  async deleteChat(id: string, userId?: string): Promise<ApiResponse<void>> {
    const searchParams = new URLSearchParams();
    if (userId) searchParams.append('userId', userId);
    const query = searchParams.toString();
    return this.request<void>(`/chat/${id}${query ? `?${query}` : ''}`, {
      method: 'DELETE',
    });
  }

  // User API methods
  async createOrLoginUser(name: string): Promise<ApiResponse<{ user: User; isNewUser: boolean }>> {
    return this.request<{ user: User; isNewUser: boolean }>('/users/create-or-login', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async loginWithUsername(username: string): Promise<ApiResponse<{ user: User }>> {
    return this.request<{ user: User }>('/users/login', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  }

  async getUserData(userId: string): Promise<ApiResponse<{
    user: User;
    stats: {
      totalChats: number;
      totalDocuments: number;
    };
  }>> {
    return this.request<{
      user: User;
      stats: {
        totalChats: number;
        totalDocuments: number;
      };
    }>(`/users/${userId}`);
  }

  async deleteUserData(userId: string): Promise<ApiResponse<{
    deletedChats: number;
    deletedDocuments: number;
  }>> {
    return this.request<{
      deletedChats: number;
      deletedDocuments: number;
    }>(`/users/${userId}/data`, {
      method: 'DELETE',
    });
  }
}

// Export singleton instance
export const apiClient = new ApiClient(API_BASE_URL);

// Export individual API functions for easier use
export const documentsApi = {
  uploadFiles: (files: FileList, userId: string, title?: string) => apiClient.uploadFiles(files, userId, title),
  addUrl: (url: string, userId: string, title?: string) => apiClient.addUrl(url, userId, title),
  addText: (text: string, title: string, userId: string) => apiClient.addText(text, title, userId),
  getDocuments: (params?: Parameters<typeof apiClient.getDocuments>[0]) => 
    apiClient.getDocuments(params),
  getDocument: (id: string, userId?: string) => apiClient.getDocument(id, userId),
  deleteDocument: (id: string, userId?: string) => apiClient.deleteDocument(id, userId),
  getSummary: (userId?: string) => apiClient.getDocumentSummary(userId),
};

export const chatApi = {
  createChat: (title: string, userId: string, documentIds?: string[]) => 
    apiClient.createChat(title, userId, documentIds),
  sendMessage: (message: string, userId: string, chatId?: string, documentIds?: string[]) => 
    apiClient.sendMessage(message, userId, chatId, documentIds),
  getChats: (params?: Parameters<typeof apiClient.getChats>[0]) => 
    apiClient.getChats(params),
  getChat: (id: string, userId?: string) => apiClient.getChat(id, userId),
  getChatHistory: (id: string, userId?: string) => apiClient.getChatHistory(id, userId),
  deleteChat: (id: string, userId?: string) => apiClient.deleteChat(id, userId),
};

export const userApi = {
  createOrLogin: (name: string) => apiClient.createOrLoginUser(name),
  loginWithUsername: (username: string) => apiClient.loginWithUsername(username),
  getUserData: (userId: string) => apiClient.getUserData(userId),
  deleteUserData: (userId: string) => apiClient.deleteUserData(userId),
};
