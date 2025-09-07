const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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
  type: 'file' | 'url' | 'text';
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
  };
  createdAt: string;
  updatedAt: string;
  // Legacy field for backward compatibility
  _id?: string;
  content?: string;
  fileType?: string;
  url?: string;
}

export interface Chat {
  _id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
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
  async uploadFiles(files: FileList): Promise<ApiResponse<Document[]>> {
    const formData = new FormData();
    Array.from(files).forEach(file => {
      formData.append('files', file);
    });

    return this.request<Document[]>('/documents/upload', {
      method: 'POST',
      headers: {}, // Remove Content-Type to let browser set it with boundary
      body: formData,
    });
  }

  async addUrl(url: string): Promise<ApiResponse<Document>> {
    return this.request<Document>('/documents/url', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  async addText(text: string, title?: string): Promise<ApiResponse<Document>> {
    return this.request<Document>('/documents/text', {
      method: 'POST',
      body: JSON.stringify({ content: text, title }),
    });
  }

  async getDocuments(params?: {
    page?: number;
    limit?: number;
    type?: string;
    status?: string;
  }): Promise<ApiResponse<{ documents: Document[] }>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.type) searchParams.append('type', params.type);
    if (params?.status) searchParams.append('status', params.status);

    const query = searchParams.toString();
    return this.request<{ documents: Document[] }>(
      `/documents${query ? `?${query}` : ''}`
    );
  }

  async getDocument(id: string): Promise<ApiResponse<Document>> {
    return this.request<Document>(`/documents/${id}`);
  }

  async deleteDocument(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/documents/${id}`, {
      method: 'DELETE',
    });
  }

  async getDocumentSummary(): Promise<ApiResponse<{
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
  }>> {
    return this.request('/documents/summary');
  }

  // Chat API methods
  async createChat(): Promise<ApiResponse<Chat>> {
    return this.request<Chat>('/chat', {
      method: 'POST',
    });
  }

  async sendMessage(
    message: string,
    chatId?: string
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
      body: JSON.stringify({ message, chatId }),
    });
  }

  async getChats(params?: {
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<PaginatedResponse<Chat>>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.limit) searchParams.append('limit', params.limit.toString());

    const query = searchParams.toString();
    return this.request<PaginatedResponse<Chat>>(
      `/chat${query ? `?${query}` : ''}`
    );
  }

  async getChat(id: string): Promise<ApiResponse<Chat & { messages: Message[] }>> {
    return this.request<Chat & { messages: Message[] }>(`/chat/${id}`);
  }

  async getChatHistory(id: string): Promise<ApiResponse<Message[]>> {
    return this.request<Message[]>(`/chat/${id}/history`);
  }

  async deleteChat(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/chat/${id}`, {
      method: 'DELETE',
    });
  }
}

// Export singleton instance
export const apiClient = new ApiClient(API_BASE_URL);

// Export individual API functions for easier use
export const documentsApi = {
  uploadFiles: (files: FileList) => apiClient.uploadFiles(files),
  addUrl: (url: string) => apiClient.addUrl(url),
  addText: (text: string, title?: string) => apiClient.addText(text, title),
  getDocuments: (params?: Parameters<typeof apiClient.getDocuments>[0]) => 
    apiClient.getDocuments(params),
  getDocument: (id: string) => apiClient.getDocument(id),
  deleteDocument: (id: string) => apiClient.deleteDocument(id),
  getSummary: () => apiClient.getDocumentSummary(),
};

export const chatApi = {
  createChat: () => apiClient.createChat(),
  sendMessage: (message: string, chatId?: string) => 
    apiClient.sendMessage(message, chatId),
  getChats: (params?: Parameters<typeof apiClient.getChats>[0]) => 
    apiClient.getChats(params),
  getChat: (id: string) => apiClient.getChat(id),
  getChatHistory: (id: string) => apiClient.getChatHistory(id),
  deleteChat: (id: string) => apiClient.deleteChat(id),
};
