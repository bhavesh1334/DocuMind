import { Request, Response } from 'express';
import { Chat } from '@/models/Chat';
import { Document } from '@/models/Document';
import { chatService } from '@/services/chatService';
import { logger } from '@/utils/logger';

// Create new chat
export const createChat = async (req: Request, res: Response) => {
  try {
    const { title, documentIds } = req.body;
    
    // Validate document IDs if provided
    if (documentIds && documentIds.length > 0) {
      const existingDocs = await Document.find({
        _id: { $in: documentIds },
        status: 'completed'
      });
      
      if (existingDocs.length !== documentIds.length) {
        return res.status(400).json({
          success: false,
          message: 'Some documents not found or not completed processing',
        });
      }
    }

    const chat = new Chat({
      title,
      documentIds: documentIds || [],
      messages: [],
    });

    await chat.save();

    res.status(201).json({
      success: true,
      message: 'Chat created successfully',
      data: chat,
    });
  } catch (error) {
    logger.error('Error creating chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create chat',
    });
  }
};

// Send message
export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { message, chatId, documentIds } = req.body;
    
    let chat;
    let isNewChat = false;

    if (chatId) {
      // Find existing chat
      chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(404).json({
          success: false,
          message: 'Chat not found',
        });
      }
    } else {
      // Create new chat
      const title = await chatService.generateTitle(message);
      
      // If no documentIds provided, use all completed documents
      let defaultDocumentIds = documentIds || [];
      if (!documentIds || documentIds.length === 0) {
        const allDocs = await Document.find({ status: 'completed' }).select('_id');
        defaultDocumentIds = allDocs.map(doc => doc._id.toString());
      }
      
      chat = new Chat({
        title,
        documentIds: defaultDocumentIds,
        messages: [],
      });
      isNewChat = true;
    }

    // Validate document IDs - use all completed docs if none specified
    let targetDocumentIds = documentIds || chat.documentIds;
    if (!targetDocumentIds || targetDocumentIds.length === 0) {
      const allDocs = await Document.find({ status: 'completed' }).select('_id');
      targetDocumentIds = allDocs.map(doc => doc._id.toString());
    }
    if (targetDocumentIds.length > 0) {
      const existingDocs = await Document.find({
        _id: { $in: targetDocumentIds },
        status: 'completed'
      });
      
      if (existingDocs.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No completed documents found for the provided IDs',
        });
      }
    }

    // Get conversation history for context
    const conversationHistory = chat.messages.slice(-10).map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    // Generate response using chat service
    const response = await chatService.chat(message, {
      documentIds: targetDocumentIds,
      conversationHistory,
    });

    // Add user message
    chat.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date(),
    });

    // Add assistant response
    chat.messages.push({
      role: 'assistant',
      content: response.content,
      timestamp: new Date(),
      metadata: {
        sources: response.sources,
        retrievedChunks: response.retrievedChunks,
        enhancedQuery: response.enhancedQuery,
      },
    });

    // Update document IDs if provided and different
    if (documentIds && JSON.stringify(documentIds.sort()) !== JSON.stringify(chat.documentIds.sort())) {
      chat.documentIds = documentIds;
    }

    await chat.save();

    res.json({
      success: true,
      message: isNewChat ? 'Chat created and message sent' : 'Message sent successfully',
      data: {
        chatId: chat._id,
        isNewChat,
        userMessage: {
          role: 'user',
          content: message,
          timestamp: chat.messages[chat.messages.length - 2].timestamp,
        },
        assistantMessage: {
          role: 'assistant',
          content: response.content,
          timestamp: chat.messages[chat.messages.length - 1].timestamp,
          metadata: {
            sources: response.sources,
            retrievedChunks: response.retrievedChunks,
            enhancedQuery: response.enhancedQuery,
          },
        },
        chat: {
          id: chat._id,
          title: chat.title,
          documentIds: chat.documentIds,
        },
      },
    });
  } catch (error) {
    logger.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Get all chats
export const getChats = async (req: Request, res: Response) => {
  try {
    const { page, limit, sort } = req.query as any;
    
    const skip = (page - 1) * limit;
    
    const [chats, total] = await Promise.all([
      Chat.find({})
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select('title documentIds createdAt updatedAt')
        .populate('documentIds', 'title type status'),
      Chat.countDocuments({}),
    ]);

    // Add message count and last message info
    const chatsWithStats = await Promise.all(
      chats.map(async (chat) => {
        const chatDoc = await Chat.findById(chat._id).select('messages');
        const messageCount = chatDoc?.messages.length || 0;
        const lastMessage = chatDoc?.messages[messageCount - 1];
        
        return {
          ...chat.toJSON(),
          messageCount,
          lastMessage: lastMessage ? {
            role: lastMessage.role,
            content: lastMessage.content.substring(0, 100) + '...',
            timestamp: lastMessage.timestamp,
          } : null,
        };
      })
    );

    res.json({
      success: true,
      data: {
        chats: chatsWithStats,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching chats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chats',
    });
  }
};

// Get single chat
export const getChat = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const chat = await Chat.findById(id).populate('documentIds', 'title type status summary');
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    res.json({
      success: true,
      data: chat,
    });
  } catch (error) {
    logger.error('Error fetching chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat',
    });
  }
};

// Get chat history (messages only)
export const getChatHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const chat = await Chat.findById(id).select('messages');
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    res.json({
      success: true,
      data: {
        messages: chat.messages,
      },
    });
  } catch (error) {
    logger.error('Error fetching chat history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat history',
    });
  }
};

// Delete chat
export const deleteChat = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const chat = await Chat.findById(id);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    await Chat.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Chat deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting chat:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete chat',
    });
  }
};