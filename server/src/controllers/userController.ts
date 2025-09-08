import { Request, Response } from 'express';
import { User } from '@/models/User';
import { Chat } from '@/models/Chat';
import { Document } from '@/models/Document';
import { logger } from '@/utils/logger';

// Create or login user by name
export const createOrLoginUser = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Name is required'
      });
    }

    const trimmedName = name.trim();

    // Check if user already exists with this exact name
    let user = await User.findOne({ name: trimmedName });

    if (!user) {
      // Generate unique username
      const username = await (User as any).generateUsername(trimmedName);
      
      // Create new user
      user = new User({
        name: trimmedName,
        username
      });

      await user.save();
      logger.info(`New user created: ${username}`);

      return res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: {
          user: {
            id: user._id,
            name: user.name,
            username: user.username
          },
          isNewUser: true
        }
      });
    }

    // User exists, return their data
    logger.info(`User logged in: ${user.username}`);
    return res.status(200).json({
      success: true,
      message: 'User logged in successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          username: user.username
        },
        isNewUser: false
      }
    });

  } catch (error) {
    logger.error('Error in createOrLoginUser:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Login with username
export const loginWithUsername = async (req: Request, res: Response) => {
  try {
    const { username } = req.body;

    if (!username || typeof username !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }

    // Find user by username
    const user = await User.findOne({ username: username.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    logger.info(`User logged in with username: ${user.username}`);
    return res.status(200).json({
      success: true,
      message: 'User logged in successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          username: user.username
        }
      }
    });

  } catch (error) {
    logger.error('Error in loginWithUsername:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get user data with stats
export const getUserData = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user statistics
    const [chatCount, documentCount] = await Promise.all([
      Chat.countDocuments({ userId }),
      Document.countDocuments({ userId })
    ]);

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          username: user.username,
          createdAt: user.createdAt
        },
        stats: {
          totalChats: chatCount,
          totalDocuments: documentCount
        }
      }
    });

  } catch (error) {
    logger.error('Error in getUserData:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete all user data
export const deleteAllUserData = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete all user's chats and documents
    const [deletedChats, deletedDocuments] = await Promise.all([
      Chat.deleteMany({ userId }),
      Document.deleteMany({ userId })
    ]);

    logger.info(`Deleted all data for user ${user.username}: ${deletedChats.deletedCount} chats, ${deletedDocuments.deletedCount} documents`);

    return res.status(200).json({
      success: true,
      message: 'All user data deleted successfully',
      data: {
        deletedChats: deletedChats.deletedCount,
        deletedDocuments: deletedDocuments.deletedCount
      }
    });

  } catch (error) {
    logger.error('Error in deleteAllUserData:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
