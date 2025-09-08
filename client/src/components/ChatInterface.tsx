import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles, Copy, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useChatOperations, useChat } from '@/hooks/useApi';
import { Chat, Message as ApiMessage } from '@/lib/api';

interface DisplayMessage {
  _id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  sources?: Array<{
    documentId: string;
    title: string;
    relevanceScore: number;
  }>;
}

interface User {
  id: string;
  name: string;
  username: string;
}

interface ChatInterfaceProps {
  user: User;
}

export const ChatInterface = ({ user }: ChatInterfaceProps) => {
  const [inputValue, setInputValue] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // API hooks
  const { data: currentChatResponse } = useChat(currentChatId || '');
  const { sendMessage, createChat, isSending } = useChatOperations();

  const currentChat = currentChatResponse?.data;

  // Welcome message when no chat is selected
  const welcomeMessage: DisplayMessage = {
    _id: 'welcome',
    role: 'assistant',
    content: "👋 Hello! I'm your AI assistant. Upload some documents on the left, and I'll help you analyze, summarize, or answer questions about your content. What would you like to explore today?",
    createdAt: new Date().toISOString(),
  };

  // Update messages when chat data changes
  useEffect(() => {
    if (currentChat?.messages) {
      // Map server messages to display format, handling timestamp field
      const mappedMessages = currentChat.messages.map((msg: any) => ({
        _id: msg._id || `msg-${Date.now()}-${Math.random()}`,
        role: msg.role,
        content: msg.content,
        createdAt: msg.timestamp || msg.createdAt || new Date().toISOString(),
        sources: msg.metadata?.sources,
      }));
      setMessages(mappedMessages);
    } else if (!currentChatId) {
      setMessages([welcomeMessage]);
    }
  }, [currentChat?.messages, currentChatId]);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isSending) return;

    const messageText = inputValue;
    setInputValue('');

    // Add user message immediately to UI for better UX
    const userMessage: DisplayMessage = {
      _id: `temp-${Date.now()}`,
      role: 'user',
      content: messageText,
      createdAt: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, userMessage]);

    sendMessage(
      { message: messageText, chatId: currentChatId || undefined },
      {
        onSuccess: (response) => {
          // If a new chat was created, set it as current
          if (response.data?.chatId && !currentChatId) {
            setCurrentChatId(response.data.chatId);
          }
          
          // Add the AI response immediately to the UI
          if (response.data?.assistantMessage) {
            const aiMessage: DisplayMessage = {
              _id: `ai-${Date.now()}`,
              role: 'assistant',
              content: response.data.assistantMessage.content,
              createdAt: response.data.assistantMessage.timestamp || new Date().toISOString(),
              sources: response.data.assistantMessage.metadata?.sources,
            };
            
            setMessages(prev => {
              // Replace the temporary user message with the final user message and add AI response
              const withoutTemp = prev.filter(msg => msg._id !== userMessage._id);
              const finalUserMessage = {
                ...userMessage,
                _id: `user-${Date.now()}`,
                createdAt: response.data.userMessage?.timestamp || userMessage.createdAt,
              };
              return [...withoutTemp, finalUserMessage, aiMessage];
            });
          }
        },
        onError: () => {
          // Remove the temporary user message on error
          setMessages(prev => prev.filter(msg => msg._id !== userMessage._id));
        }
      }
    );
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const copyMessage = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
      toast({
        title: "Copied to clipboard",
        description: "Message content has been copied.",
      });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Could not copy message to clipboard.",
        variant: "destructive",
      });
    }
  };

  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return '';
    
    try {
      const date = new Date(timestamp);
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        return '';
      }
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      console.warn('Invalid timestamp:', timestamp);
      return '';
    }
  };

  return (
    <div className="h-full flex flex-col bg-gradient-surface">
      {/* Chat Header */}
      <div className="p-6 border-b border-border bg-card shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              AI Assistant
            </h2>
            <p className="text-sm text-muted-foreground">
              Ask questions about your documents
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-6" ref={scrollAreaRef}>
        <div className="space-y-6 max-w-4xl mx-auto">
          {messages.map((message) => (
            <div
              key={message._id}
              className={`flex gap-4 ${
                message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              {/* Avatar */}
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {message.role === 'user' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>

              {/* Message Content */}
              <div className={`flex-1 max-w-3xl ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
                <Card
                  className={`${
                    message.role === 'user'
                      ? 'bg-chat-bubble-user text-chat-bubble-user-foreground ml-8'
                      : 'bg-chat-bubble-ai text-chat-bubble-ai-foreground mr-8'
                  } transition-all duration-200 hover:shadow-md group`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {message.content}
                        </p>
                        
                        {/* Sources */}
                        {message.sources && message.sources.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1">
                            {message.sources.map((source, index) => (
                              <Badge
                                key={index}
                                variant="secondary"
                                className="text-xs px-2 py-1"
                                title={`Relevance: ${(source.relevanceScore * 100).toFixed(1)}%`}
                              >
                                {source.title}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Timestamp */}
                        <p className="text-xs opacity-60 mt-2">
                          {formatTimestamp(message.createdAt)}
                        </p>
                      </div>

                      {/* Copy Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyMessage(message._id, message.content)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 h-8 w-8 p-0"
                      >
                        {copiedMessageId === message._id ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ))}

          {/* Loading Indicator */}
          {isSending && (
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                <Bot className="h-4 w-4" />
              </div>
              <Card className="bg-chat-bubble-ai text-chat-bubble-ai-foreground mr-8">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <p className="text-sm">AI is thinking...</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-6 border-t border-border bg-card">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything about your documents..."
                className="pr-12 h-12 transition-smooth"
                disabled={isSending}
              />
            </div>
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isSending}
              className="h-12 px-6 gap-2 transition-smooth"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};