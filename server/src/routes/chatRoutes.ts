import express, { Router } from 'express';
import { validate, validateQuery } from '@/utils/validation';
import {
  createChatSchema,
  sendMessageSchema,
  paginationSchema,
} from '@/utils/validation';
import {
  createChat,
  sendMessage,
  getChats,
  getChat,
  deleteChat,
  getChatHistory,
} from '@/controllers/chatController';

const router: Router = express.Router();

// Create new chat
router.post('/', validate(createChatSchema), createChat);

// Send message (can create new chat if chatId not provided)
router.post('/message', validate(sendMessageSchema), sendMessage);

// Get all chats with pagination
router.get('/', validateQuery(paginationSchema), getChats);

// Get single chat with full message history
router.get('/:id', getChat);

// Get chat history (messages only)
router.get('/:id/history', getChatHistory);

// Delete chat
router.delete('/:id', deleteChat);

export default router;