import express, { Router } from 'express';
import {
  createOrLoginUser,
  loginWithUsername,
  getUserData,
  deleteAllUserData
} from '@/controllers/userController';

const router: Router = express.Router();

// POST /api/users/create-or-login - Create new user or login existing user by name
router.post('/create-or-login', createOrLoginUser);

// POST /api/users/login - Login with username
router.post('/login', loginWithUsername);

// GET /api/users/:userId - Get user data with stats
router.get('/:userId', getUserData);

// DELETE /api/users/:userId/data - Delete all user data (chats, documents)
router.delete('/:userId/data', deleteAllUserData);

export default router;
