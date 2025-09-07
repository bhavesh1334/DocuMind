import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentsApi, chatApi, Document, Chat, Message, ApiError } from '@/lib/api';
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
  chatHistory: (id: string) => ['chats', id, 'history'] as const,
};

// Document Hooks
export function useDocuments(params?: {
  page?: number;
  limit?: number;
  type?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: queryKeys.documentsList(params),
    queryFn: () => documentsApi.getDocuments(params),
    staleTime: 30000, // 30 seconds
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: queryKeys.document(id),
    queryFn: () => documentsApi.getDocument(id),
    enabled: !!id,
  });
}

export function useDocumentsSummary() {
  return useQuery({
    queryKey: queryKeys.documentsSummary,
    queryFn: () => documentsApi.getSummary(),
    staleTime: 60000, // 1 minute
  });
}

export function useUploadFiles() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: documentsApi.uploadFiles,
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
    mutationFn: documentsApi.addUrl,
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
    mutationFn: ({ text, title }: { text: string; title?: string }) =>
      documentsApi.addText(text, title),
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
    mutationFn: documentsApi.deleteDocument,
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
}) {
  return useQuery({
    queryKey: queryKeys.chatsList(params),
    queryFn: () => chatApi.getChats(params),
    staleTime: 30000,
  });
}

export function useChat(id: string) {
  return useQuery({
    queryKey: queryKeys.chat(id),
    queryFn: () => chatApi.getChat(id),
    enabled: !!id,
  });
}

export function useChatHistory(id: string) {
  return useQuery({
    queryKey: queryKeys.chatHistory(id),
    queryFn: () => chatApi.getChatHistory(id),
    enabled: !!id,
  });
}

export function useCreateChat() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: chatApi.createChat,
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
    mutationFn: ({ message, chatId }: { message: string; chatId?: string }) =>
      chatApi.sendMessage(message, chatId),
    onSuccess: (response, variables) => {
      // Invalidate chat queries
      queryClient.invalidateQueries({ queryKey: queryKeys.chats });
      
      // If we have a chatId, invalidate specific chat queries
      if (variables.chatId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.chat(variables.chatId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.chatHistory(variables.chatId) });
      }
      
      // If a new chat was created, invalidate the new chat
      if (response.data?.chat?._id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.chat(response.data.chat._id) });
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
    mutationFn: chatApi.deleteChat,
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
