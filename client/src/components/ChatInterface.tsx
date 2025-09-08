import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles, Copy, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useChatOperations, useChat } from '@/hooks/useApi';
import { Chat, Message as ApiMessage } from '@/lib/api';
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

export const ChatInterface = ({ user }: ChatInterfaceProps) => {
  const [inputValue, setInputValue] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
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
  const { sendMessage, createChat, isSending } = useChatOperations();

  const currentChat = currentChatResponse?.data;

  // Welcome message when no chat is selected
  const welcomeMessage: DisplayMessage = {
    _id: 'welcome',
    role: 'assistant',
    content: "👋 Hello! I'm your AI assistant. Upload some documents on the left, and I'll help you analyze, summarize, or answer questions about your content. What would you like to explore today?",
    createdAt: new Date().toISOString(),
  };

  // Restore currentChatId from localStorage on mount
  useEffect(() => {
    const savedChatId = localStorage.getItem(`currentChatId_${user.id}`);
    if (savedChatId) {
      setCurrentChatId(savedChatId);
    }
    setIsInitialized(true);
  }, [user.id]);

  // Listen for user data deletion to immediately reset chat state
  useEffect(() => {
    const handleUserDataDeleted = (e: CustomEvent) => {
      if (e.detail?.userId === user.id) {
        // User data was deleted, immediately reset chat state
        setCurrentChatId(null);
        setMessages([welcomeMessage]);
      }
    };

    window.addEventListener('userDataDeleted', handleUserDataDeleted as EventListener);
    return () => window.removeEventListener('userDataDeleted', handleUserDataDeleted as EventListener);
  }, [user.id, welcomeMessage]);

  // Save currentChatId to localStorage whenever it changes
  useEffect(() => {
    if (isInitialized) {
      if (currentChatId) {
        localStorage.setItem(`currentChatId_${user.id}`, currentChatId);
      } else {
        localStorage.removeItem(`currentChatId_${user.id}`);
      }
    }
  }, [currentChatId, user.id, isInitialized]);

  // Check if user is near bottom of scroll area
  const isNearBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
        return scrollHeight - scrollTop - clientHeight < 100; // Within 100px of bottom
      }
    }
    return true;
  };

  // Scroll to bottom helper function
  const scrollToBottom = () => {
    if (scrollAreaRef.current && shouldAutoScroll) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  };

  // Handle scroll events to detect user scrolling
  const handleScroll = () => {
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
  };

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

  // Auto-scroll to bottom when messages change or on initial load
  useEffect(() => {
    if (messages.length > 0 && !isUserScrolling) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(scrollToBottom, 100);
    }
  }, [messages, isUserScrolling]);

  // Auto-scroll when loading state changes (for smooth UX during message sending)
  useEffect(() => {
    if (isSending) {
      setShouldAutoScroll(true); // Always auto-scroll when sending a message
      setTimeout(scrollToBottom, 100);
    }
  }, [isSending]);

  // Set up scroll event listener
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.addEventListener('scroll', handleScroll);
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
      }
    }
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);


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
              Chat
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
                        <MessageRenderer
                          content={message.content}
                          role={message.role}
                          onCopy={() => copyMessage(message._id, message.content)}
                          isCopied={copiedMessageId === message._id}
                        />
                        
                        {/* Sources */}
                        {/* {message.sources && message.sources.length > 0 && (
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
                        )} */}

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
          ))}

          {/* Enhanced Loading Indicator */}
          {isSending && (
            <motion.div 
              className="flex gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
               <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                <Bot className="h-4 w-4" />
              </div>
              <Card className="bg-chat-bubble-ai text-chat-bubble-ai-foreground mr-8">
                <CardContent className="p-4">
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