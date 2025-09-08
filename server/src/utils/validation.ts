import Joi from 'joi';

// Document validation schemas
export const uploadFileSchema = Joi.object({
  title: Joi.string().optional().max(500),
});

export const addUrlSchema = Joi.object({
  url: Joi.string().uri().required(),
  title: Joi.string().optional().max(500),
});

export const addTextSchema = Joi.object({
  content: Joi.string().required().min(10).max(50000),
  title: Joi.string().required().max(500),
});

// Chat validation schemas
export const createChatSchema = Joi.object({
  title: Joi.string().required().max(200),
  documentIds: Joi.array().items(Joi.string().regex(/^[0-9a-fA-F]{24}$/)).optional(),
});

export const sendMessageSchema = Joi.object({
  message: Joi.string().required().min(1).max(2000),
  chatId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  documentIds: Joi.array().items(Joi.string().regex(/^[0-9a-fA-F]{24}$/)).optional(),
});

// Query parameters validation
export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sort: Joi.string().valid('createdAt', '-createdAt', 'title', '-title').default('-createdAt'),
});

export const documentFilterSchema = Joi.object({
  type: Joi.string().valid('file', 'url', 'youtube', 'text').optional(),
  status: Joi.string().valid('processing', 'completed', 'failed').optional(),
  userId: Joi.string().optional(),
}).concat(paginationSchema);

// File validation
export const validateFileType = (mimeType: string): boolean => {
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/csv',
    'text/markdown',
  ];
  return allowedTypes.includes(mimeType);
};

export const validateFileSize = (size: number): boolean => {
  const maxSize = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB default
  return size <= maxSize;
};

export const validateYouTubeUrl = (url: string): boolean => {
  const youtubeRegex = /^(https?\:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
  return youtubeRegex.test(url);
};

export const isYouTubeUrl = (url: string): boolean => {
  return validateYouTubeUrl(url);
};

// Middleware for validation
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
        })),
      });
    }
    req.validatedBody = value;
    next();
  };
};

export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Query validation error',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
        })),
      });
    }
    req.validatedQuery = value;
    next();
  };
};