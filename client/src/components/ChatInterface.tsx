import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useChatOperations, useChat, useDocuments } from '@/hooks/useApi';
import { MessageRenderer } from '@/components/MessageRenderer';

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

export const ChatInterface = memo(({ user }: ChatInterfaceProps) => {
  const [inputValue, setInputValue] = useState('');
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // API hooks
  const { data: currentChatResponse } = useChat(currentChatId || '', user.id);
  const { sendMessage, isSending } = useChatOperations();
  const { data: documentsResponse } = useDocuments({ limit: 50, userId: user.id });

  const currentChat = currentChatResponse?.data;
  
  // Check if user has any completed documents
  const documents = documentsResponse?.data?.documents || [];
  const hasCompletedDocuments = documents.some(doc => doc.status === 'completed');

  // Welcome message when no chat is selected - memoized to prevent recreation
  const welcomeMessage: DisplayMessage = useMemo(() => ({
    _id: 'welcome',
    role: 'assistant',
    content: hasCompletedDocuments 
      ? "👋 Hello! I'm your AI assistant. Upload some documents on the left, and I'll help you analyze, summarize, or answer questions about your content. What would you like to explore today?"
      : "👋 Hello! I'm your AI assistant. Please upload some documents, add URLs, or paste text content on the left panel first. Once you have documents available, I'll be able to help you analyze, summarize, or answer questions about your content.",
    createdAt: new Date().toISOString(),
  }), [hasCompletedDocuments]);

  // Restore currentChatId from localStorage on mount - add user.id dependency
  useEffect(() => {
    const savedChatId = localStorage.getItem(`currentChatId_${user.id}`);
    if (savedChatId) {
      setCurrentChatId(savedChatId);
    }
    setIsInitialized(true);
  }, [user.id]);

  // Listen for user data deletion to immediately reset chat state - memoized handler
  const handleUserDataDeleted = useCallback((e: CustomEvent) => {
    if (e.detail?.userId === user.id) {
      // User data was deleted, immediately reset chat state
      setCurrentChatId(null);
      setMessages([welcomeMessage]);
    }
  }, [user.id, welcomeMessage]);

  useEffect(() => {
    window.addEventListener('userDataDeleted', handleUserDataDeleted as EventListener);
    return () => window.removeEventListener('userDataDeleted', handleUserDataDeleted as EventListener);
  }, [handleUserDataDeleted]);

  // Save currentChatId to localStorage whenever it changes - optimized with user.id dependency
  useEffect(() => {
    if (isInitialized) {
      if (currentChatId) {
        localStorage.setItem(`currentChatId_${user.id}`, currentChatId);
      } else {
        localStorage.removeItem(`currentChatId_${user.id}`);
      }
    }
  }, [currentChatId, isInitialized, user.id]);

  // Check if user is near bottom of scroll area - memoized to prevent recreation
  const isNearBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
        return scrollHeight - scrollTop - clientHeight < 100; // Within 100px of bottom
      }
    }
    return true;
  }, []);

  // Scroll to bottom helper function - memoized to prevent recreation
  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current && shouldAutoScroll) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [shouldAutoScroll]);

  // Handle scroll events to detect user scrolling - memoized to prevent recreation
  const handleScroll = useCallback(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    setIsUserScrolling(true);
    setShouldAutoScroll(isNearBottom());

    // Reset user scrolling state after scroll stops
    scrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
      setShouldAutoScroll(isNearBottom());
    }, 150);
  }, [isNearBottom]);

  // Update messages when chat data changes
  useEffect(() => {
    if (!isInitialized) return; // Wait for initialization
    
    if (currentChat?.messages) {
      // Map server messages to display format, handling timestamp field
      const serverMessages = currentChat.messages.map((msg: any) => ({
        _id: msg._id || `msg-${Date.now()}-${Math.random()}`,
        role: msg.role,
        content: msg.content,
        createdAt: msg.timestamp || msg.createdAt || new Date().toISOString(),
        sources: msg.metadata?.sources,
      }));
      
      // Only update if we're not currently sending a message or if server has more messages
      // This prevents overwriting optimistic updates
      setMessages(prevMessages => {
        // If we're sending and server messages are same or fewer, keep current messages
        if (isSending && serverMessages.length <= prevMessages.length) {
          return prevMessages;
        }
        
        // If we have temporary messages (starting with 'temp-'), preserve them
        const tempMessages = prevMessages.filter(msg => msg._id.startsWith('temp-'));
        
        // If we have temp messages and server messages don't include them yet, merge them
        if (tempMessages.length > 0 && serverMessages.length < prevMessages.length) {
          return [...serverMessages, ...tempMessages];
        }
        
        return serverMessages;
      });
    } else if (!currentChatId) {
      setMessages([welcomeMessage]);
    }
  }, [currentChat?.messages, currentChatId, isInitialized, welcomeMessage, isSending]);

  // Auto-scroll to bottom when messages change or on initial load - optimized with scrollToBottom dependency
  useEffect(() => {
    if (messages.length > 0 && !isUserScrolling) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(scrollToBottom, 100);
    }
  }, [messages, isUserScrolling, scrollToBottom]);

  // Auto-scroll when loading state changes (for smooth UX during message sending) - optimized with scrollToBottom dependency
  useEffect(() => {
    if (isSending) {
      setShouldAutoScroll(true); // Always auto-scroll when sending a message
      setTimeout(scrollToBottom, 100);
    }
  }, [isSending, scrollToBottom]);

  // Set up scroll event listener - add handleScroll dependency
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.addEventListener('scroll', handleScroll);
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
      }
    }
  }, [handleScroll]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);


  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || isSending || !hasCompletedDocuments) return;

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
      { message: messageText, userId: user.id, chatId: currentChatId || undefined },
      {
        onSuccess: (response) => {
          // If a new chat was created, set it as current
          if (response.data?.chatId && !currentChatId) {
            setCurrentChatId(response.data.chatId);
          }
          
        },
        onError: () => {
          // Remove the temporary user message on error
          setMessages(prev => prev.filter(msg => msg._id !== userMessage._id));
        }
      }
    );
  }, [inputValue, isSending, hasCompletedDocuments, sendMessage, user.id, currentChatId]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);


  const formatTimestamp = useCallback((timestamp: string) => {
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
  }, []);

  return (
    <div className="h-full flex flex-col bg-gradient-surface">
      {/* Chat Header */}
      <div className="p-4 sm:p-6 border-b border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-foreground">
              Chat
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Ask questions about your documents
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-3 sm:p-6" ref={scrollAreaRef}>
        <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto">
            {messages.map((message) => (
            <MessageItem
              key={message._id}
              message={message}
              formatTimestamp={formatTimestamp}
            />
          ))}

          {/* Enhanced Loading Indicator */}
          {isSending && (
            <motion.div 
              className="flex gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
               <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                <Bot className="h-3 w-3 sm:h-4 sm:w-4" />
              </div>
              <Card className="bg-chat-bubble-ai text-chat-bubble-ai-foreground mr-4 sm:mr-8">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-3">
                    {/* Animated dots */}
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="w-2 h-2 bg-current rounded-full opacity-60"
                          animate={{
                            scale: [1, 1.2, 1],
                            opacity: [0.6, 1, 0.6],
                          }}
                          transition={{
                            duration: 1.5,
                            repeat: Infinity,
                            delay: i * 0.2,
                            ease: "easeInOut",
                          }}
                        />
                      ))}
                    </div>
                  
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-3 sm:p-6 border-t border-border bg-card">
        <div className="max-w-7xl mx-auto">
          <div className="flex gap-2 sm:gap-3">
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={hasCompletedDocuments ? "Ask me anything about your documents..." : "Please add documents first to start chatting..."}
                className="pr-12 h-10 sm:h-12 text-sm sm:text-base transition-smooth"
                disabled={isSending || !hasCompletedDocuments}
              />
            </div>
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isSending || !hasCompletedDocuments}
              className="h-10 sm:h-12 px-3 sm:px-6 gap-1 sm:gap-2 transition-smooth"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Send</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});

// Memoized message item component to prevent unnecessary re-renders
const MessageItem = memo(({ message, formatTimestamp }: {
  message: DisplayMessage;
  formatTimestamp: (timestamp: string) => string;
}) => {

  return (
    <div
      className={`flex gap-4 ${
        message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
          message.role === 'user'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {message.role === 'user' ? (
          <User className="h-3 w-3 sm:h-4 sm:w-4" />
        ) : (
          <Bot className="h-3 w-3 sm:h-4 sm:w-4" />
        )}
      </div>

      {/* Message Content */}
      <div className={` max-w-3xl ${message.role === 'user' ? 'text-right' : 'text-left flex-1'}`}>
        <Card
          className={`${
            message.role === 'user'
              ? 'bg-chat-bubble-user text-chat-bubble-user-foreground ml-4 sm:ml-8 rounded-tr-none'
              : 'bg-chat-bubble-ai text-chat-bubble-ai-foreground mr-4 sm:mr-8 rounded-tl-none'
          } transition-all duration-200 hover:shadow-md group`}
        >
          <CardContent className="p-3 sm:p-4 ">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <MessageRenderer
                  content={message.content}
                  role={message.role}
                />
                

                {/* Timestamp */}
                <p className="text-xs opacity-60 mt-2">
                  {formatTimestamp(message.createdAt)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

ChatInterface.displayName = 'ChatInterface';