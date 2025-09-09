import { Request, Response } from "express";
import { Chat } from "@/models/Chat";
import { Document } from "@/models/Document";
import { chatService } from "@/services/chatService";
import { logger } from "@/utils/logger";

// Create new chat
export const createChat = async (req: Request, res: Response) => {
  try {
    const { title, documentIds, userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // Validate document IDs if provided
    if (documentIds && documentIds.length > 0) {
      const existingDocs = await Document.find({
        _id: { $in: documentIds },
        userId,
        status: "completed",
      });

      if (existingDocs.length !== documentIds.length) {
        return res.status(400).json({
          success: false,
          message: "Some documents not found or not completed processing",
        });
      }
    }

    const chat = new Chat({
      userId,
      title,
      documentIds: documentIds || [],
      messages: [],
    });

    await chat.save();

    res.status(201).json({
      success: true,
      message: "Chat created successfully",
      data: chat,
    });
  } catch (error) {
    logger.error("Error creating chat:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create chat",
    });
  }
};

// Send message
export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { message, chatId, documentIds, userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    let chat;
    let isNewChat = false;

    if (chatId) {
      // Find existing chat
      chat = await Chat.findOne({ _id: chatId, userId });
      if (!chat) {
        return res.status(404).json({
          success: false,
          message: "Chat not found",
        });
      }
    } else {
      // Create new chat
      const title = await chatService.generateTitle(message);

      // If no documentIds provided, use all completed documents for this user
      let defaultDocumentIds = documentIds || [];
      if (!documentIds || documentIds.length === 0) {
        const allDocs = await Document.find({
          userId,
          status: "completed",
        }).select("_id");
        defaultDocumentIds = allDocs.map((doc) => doc._id.toString());
      }

      chat = new Chat({
        userId,
        title,
        documentIds: defaultDocumentIds,
        messages: [],
      });
      isNewChat = true;
    }

    // Validate document IDs - use all completed docs if none specified
    let targetDocumentIds = documentIds || chat.documentIds;

    // Always refresh document IDs to get current user's documents
    const allUserDocs = await Document.find({
      userId,
      status: "completed",
    }).select("_id");
    const allUserDocIds = allUserDocs.map((doc) => doc._id.toString());

    if (
      !targetDocumentIds ||
      targetDocumentIds.length === 0 ||
      allUserDocIds.length === 0
    ) {
      targetDocumentIds = allUserDocIds;
    } else {
      // Filter target IDs to only include existing user documents
      targetDocumentIds = targetDocumentIds.filter((id: string) =>
        allUserDocIds.includes(id)
      );
      // If none of the target IDs exist, use all user docs
      if (targetDocumentIds.length === 0) {
        targetDocumentIds = allUserDocIds;
      }
    }

    // Check if user has any completed documents at all
    if (targetDocumentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "No completed documents found. Please upload and process some documents first.",
      });
    }

    // Get conversation history for context
    const conversationHistory = chat.messages.slice(-10).map((msg) => ({
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
      role: "user",
      content: message,
      timestamp: new Date(),
    });

    // Add assistant response
    chat.messages.push({
      role: "assistant",
      content: response.content,
      timestamp: new Date(),
      metadata: {
        sources: response.sources,
        retrievedChunks: response.retrievedChunks,
        enhancedQuery: response.enhancedQuery,
      },
    });

    // Update document IDs if provided and different
    if (
      documentIds &&
      JSON.stringify(documentIds.sort()) !==
        JSON.stringify(chat.documentIds.sort())
    ) {
      chat.documentIds = documentIds;
    }

    await chat.save();

    res.json({
      success: true,
      message: isNewChat
        ? "Chat created and message sent"
        : "Message sent successfully",
      data: {
        chatId: chat._id,
        isNewChat,
        userMessage: {
          role: "user",
          content: message,
          timestamp: chat.messages[chat.messages.length - 2].timestamp,
        },
        assistantMessage: {
          role: "assistant",
          content: response.content,
          timestamp: chat.messages[chat.messages.length - 1].timestamp,
          // metadata: {
          //   sources: response.sources,
          //   retrievedChunks: response.retrievedChunks,
          //   enhancedQuery: response.enhancedQuery,
          // },
        },
        chat: {
          id: chat._id,
          title: chat.title,
          documentIds: chat.documentIds,
        },
      },
    });
  } catch (error) {
    logger.error("Error sending message:", error);
    const isProd = process.env.NODE_ENV === "production";
    const err = error as any;
    const responsePayload: any = {
      success: false,
      message: "Failed to send message",
      error: err?.message || "Unknown error",
    };
    // Expose more diagnostics in non-production to aid debugging
    if (!isProd) {
      responsePayload.details = {
        name: err?.name,
        code: err?.code,
        cause: err?.cause,
        stack: err?.stack,
      };
    }
    res.status(500).json(responsePayload);
  }
};

// Get all chats
export const getChats = async (req: Request, res: Response) => {
  try {
    // Use validated query parameters with defaults
    const validatedQuery = (req as any).validatedQuery || {};
    const {
      page = 1,
      limit = 10,
      sort = "-createdAt",
      userId,
    } = validatedQuery;

    const filter: any = {};
    if (userId) filter.userId = userId;

    const skip = (page - 1) * limit;

    const [chats, total] = await Promise.all([
      Chat.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select("title documentIds createdAt updatedAt userId")
        .populate("documentIds", "title type status"),
      Chat.countDocuments(filter),
    ]);

    // Add message count and last message info
    const chatsWithStats = await Promise.all(
      chats.map(async (chat) => {
        const chatDoc = await Chat.findById(chat._id).select("messages");
        const messageCount = chatDoc?.messages.length || 0;
        const lastMessage = chatDoc?.messages[messageCount - 1];

        return {
          ...chat.toJSON(),
          messageCount,
          lastMessage: lastMessage
            ? {
                role: lastMessage.role,
                content: lastMessage.content.substring(0, 100) + "...",
                timestamp: lastMessage.timestamp,
              }
            : null,
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
    logger.error("Error fetching chats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch chats",
    });
  }
};

// Get single chat
export const getChat = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    const filter: any = { _id: id };
    if (userId) filter.userId = userId;

    const chat = await Chat.findOne(filter).populate(
      "documentIds",
      "title type status summary"
    );

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    res.json({
      success: true,
      data: chat,
    });
  } catch (error) {
    logger.error("Error fetching chat:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch chat",
    });
  }
};

// Get chat history (messages only)
export const getChatHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    const filter: any = { _id: id };
    if (userId) filter.userId = userId;

    const chat = await Chat.findOne(filter).select("messages");

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    res.json({
      success: true,
      data: {
        messages: chat.messages,
      },
    });
  } catch (error) {
    logger.error("Error fetching chat history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch chat history",
    });
  }
};

// Delete chat
export const deleteChat = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    const filter: any = { _id: id };
    if (userId) filter.userId = userId;

    const chat = await Chat.findOne(filter);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    await Chat.findOneAndDelete(filter);

    res.json({
      success: true,
      message: "Chat deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting chat:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete chat",
    });
  }
};
