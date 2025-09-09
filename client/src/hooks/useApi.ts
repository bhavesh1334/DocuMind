import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentsApi, chatApi, userApi, ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

// Query Keys
export const queryKeys = {
  documents: ['documents'] as const,
  documentsList: (params?: any) => ['documents', 'list', params] as const,
  document: (id: string) => ['documents', id] as const,
  documentsSummary: ['documents', 'summary'] as const,
  chats: ['chats'] as const,
  chatsList: (params?: any) => ['chats', 'list', params] as const,
  chat: (id: string) => ['chats', id] as const,
  users: ['users'] as const,
};

// Document Hooks
export function useDocuments(params?: {
  page?: number;
  limit?: number;
  type?: string;
  status?: string;
  userId?: string;
}) {
  return useQuery({
    queryKey: queryKeys.documentsList(params),
    queryFn: () => documentsApi.getDocuments(params),
    staleTime: 30000, // 30 seconds
  });
}

export function useDocument(id: string, userId?: string) {
  return useQuery({
    queryKey: [...queryKeys.document(id), userId],
    queryFn: () => documentsApi.getDocument(id, userId),
    enabled: !!id && !!userId, // Require both id and userId
  });
}

export function useDocumentsSummary(userId?: string) {
  return useQuery({
    queryKey: [...queryKeys.documentsSummary, userId],
    queryFn: () => documentsApi.getSummary(userId),
    staleTime: 60000, // 1 minute
    enabled: !!userId, // Only fetch when userId is provided
  });
}

export function useUploadFiles() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ files, userId, title }: { files: FileList; userId: string; title?: string }) =>
      documentsApi.uploadFiles(files, userId, title),
    onSuccess: (response) => {
      // Invalidate and refetch documents
      queryClient.invalidateQueries({ queryKey: queryKeys.documents });
      
      const count = response.data?.length || 0;
      toast({
        title: "Upload successful",
        description: `${count} file${count !== 1 ? 's' : ''} uploaded successfully.`,
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload files. Please try again.",
        variant: "destructive",
      });
    },
  });
}

export function useAddUrl() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ url, userId, title }: { url: string; userId: string; title?: string }) =>
      documentsApi.addUrl(url, userId, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents });
      toast({
        title: "URL added successfully",
        description: "The URL content is being processed.",
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Failed to add URL",
        description: error.message || "Failed to add URL. Please check the URL and try again.",
        variant: "destructive",
      });
    },
  });
}

export function useAddText() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ text, title, userId }: { text: string; title: string; userId: string }) =>
      documentsApi.addText(text, title, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents });
      toast({
        title: "Text added successfully",
        description: "Your text content is ready for analysis.",
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Failed to add text",
        description: error.message || "Failed to add text content. Please try again.",
        variant: "destructive",
      });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId?: string }) => 
      documentsApi.deleteDocument(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents });
      toast({
        title: "Document deleted",
        description: "The document has been removed successfully.",
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Failed to delete document",
        description: error.message || "Failed to delete document. Please try again.",
        variant: "destructive",
      });
    },
  });
}

// Chat Hooks
export function useChats(params?: {
  page?: number;
  limit?: number;
  userId?: string;
}) {
  return useQuery({
    queryKey: queryKeys.chatsList(params),
    queryFn: () => chatApi.getChats(params),
    staleTime: 30000,
  });
}

export function useChat(id: string, userId?: string) {
  return useQuery({
    queryKey: [...queryKeys.chat(id), userId],
    queryFn: () => chatApi.getChat(id, userId),
    enabled: !!id && !!userId, // Require both id and userId
    staleTime: 30000, // 30 seconds - reasonable caching
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
  });
}


export function useCreateChat() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ title, userId, documentIds }: { title: string; userId: string; documentIds?: string[] }) =>
      chatApi.createChat(title, userId, documentIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chats });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Failed to create chat",
        description: error.message || "Failed to create new chat. Please try again.",
        variant: "destructive",
      });
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ message, userId, chatId, documentIds }: { message: string; userId: string; chatId?: string; documentIds?: string[] }) =>
      chatApi.sendMessage(message, userId, chatId, documentIds),
    onSuccess: (response, variables) => {
      const chatId = variables.chatId || response.data?.chat?.id;
      
      if (chatId) {
        // Invalidate the specific chat to trigger exactly one refetch
        queryClient.invalidateQueries({ 
          queryKey: [...queryKeys.chat(chatId), variables.userId],
          exact: true 
        });
        
        // Only invalidate chats list if a new chat was created
        if (!variables.chatId && response.data?.chat?.id) {
          queryClient.invalidateQueries({ queryKey: queryKeys.chats });
        }
      }
    },
    onError: (error: ApiError) => {
      toast({
        title: "Failed to send message",
        description: error.message || "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });
}

export function useDeleteChat() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId?: string }) =>
      chatApi.deleteChat(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chats });
      toast({
        title: "Chat deleted",
        description: "The chat has been deleted successfully.",
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Failed to delete chat",
        description: error.message || "Failed to delete chat. Please try again.",
        variant: "destructive",
      });
    },
  });
}

// Utility hooks for common patterns
export function useDocumentUpload() {
  const uploadFiles = useUploadFiles();
  const addUrl = useAddUrl();
  const addText = useAddText();

  return {
    uploadFiles: uploadFiles.mutate,
    addUrl: addUrl.mutate,
    addText: addText.mutate,
    isUploading: uploadFiles.isPending || addUrl.isPending || addText.isPending,
    error: uploadFiles.error || addUrl.error || addText.error,
  };
}

export function useChatOperations() {
  const sendMessage = useSendMessage();
  const createChat = useCreateChat();
  const deleteChat = useDeleteChat();

  return {
    sendMessage: sendMessage.mutate,
    createChat: createChat.mutate,
    deleteChat: deleteChat.mutate,
    isSending: sendMessage.isPending,
    isCreating: createChat.isPending,
    isDeleting: deleteChat.isPending,
    error: sendMessage.error || createChat.error || deleteChat.error,
  };
}

// User Authentication Hooks
export function useCreateOrLoginUser() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ name }: { name: string }) => userApi.createOrLogin(name),
    onSuccess: (response) => {
      const { user, isNewUser } = response.data!;
      toast({
        title: isNewUser ? "Welcome to DocuMind!" : "Welcome back!",
        description: isNewUser 
          ? `Your username is ${user.username}` 
          : `Logged in as ${user.username}`,
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create/login user",
        variant: "destructive",
      });
    },
  });
}

export function useLoginWithUsername() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ username }: { username: string }) => userApi.loginWithUsername(username),
    onSuccess: (response) => {
      const { user } = response.data!;
      toast({
        title: "Welcome back!",
        description: `Logged in as ${user.username}`,
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Error",
        description: error.message || "User not found",
        variant: "destructive",
      });
    },
  });
}

export function useGetUserData(userId?: string) {
  return useQuery({
    queryKey: [...queryKeys.users, 'data', userId],
    queryFn: () => userApi.getUserData(userId!),
    enabled: !!userId,
    staleTime: 60000, // 1 minute
  });
}

export function useDeleteUserData() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ userId }: { userId: string }) => userApi.deleteUserData(userId),
    onSuccess: (response, variables) => {
      // Clear localStorage chat data for this user
      localStorage.removeItem(`currentChatId_${variables.userId}`);
      
      // Trigger a custom event to notify components immediately
      window.dispatchEvent(new CustomEvent('userDataDeleted', { 
        detail: { userId: variables.userId } 
      }));
      
      // Invalidate all queries since all user data is deleted
      queryClient.invalidateQueries({ queryKey: queryKeys.documents });
      queryClient.invalidateQueries({ queryKey: queryKeys.chats });
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
      
      // Clear all cached chat data
      queryClient.removeQueries({ queryKey: queryKeys.chats });
      
      const data = response.data;
      toast({
        title: "Data Deleted",
        description: `Deleted ${data?.deletedChats || 0} chats and ${data?.deletedDocuments || 0} documents`,
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete data",
        variant: "destructive",
      });
    },
  });
}
