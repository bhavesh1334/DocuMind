import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { Document } from '@/models/Document';
import { documentProcessor } from '@/services/documentProcessor';
import { vectorService } from '@/services/vectorService';
import { logger } from '@/utils/logger';
import { isYouTubeUrl } from '@/utils/validation';

// Upload and process files
export const uploadFiles = async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  const { userId } = req.body;
  
  if (!files || files.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No files uploaded',
    });
  }

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'User ID is required',
    });
  }

  const results = [];
  const errors = [];

  for (const file of files) {
    try {
      logger.info(`Processing file: ${file.originalname} for user: ${userId}`);
      
      // Create document record
      const document = new Document({
        userId,
        title: req.body.title || path.parse(file.originalname).name,
        content: '',
        summary: '',
        type: 'file',
        source: file.filename,
        metadata: {
          originalName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
        },
        status: 'processing',
      });

      await document.save();

      // Process file synchronously and wait for indexing
      const processingResult = await processFileSync(document._id, file.path, file.originalname, file.mimetype);
      
      results.push({
        id: document._id,
        title: document.title,
        status: processingResult.status,
        originalName: file.originalname,
        error: processingResult.error,
      });
    } catch (error) {
      logger.error(`Error processing file ${file.originalname}:`, error);
      errors.push({
        file: file.originalname,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Clean up file on error
      try {
        await fs.unlink(file.path);
      } catch (unlinkError) {
        logger.error(`Failed to delete file ${file.path}:`, unlinkError);
      }
    }
  }

  res.status(201).json({
    success: true,
    message: `${results.length} file(s) uploaded and processing started`,
    data: results,
    errors: errors.length > 0 ? errors : undefined,
  });
};

// Add URL
export const addUrl = async (req: Request, res: Response) => {
  try {
    const { url, title, userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }
    
    // Determine if it's a YouTube URL
    const isYoutube = isYouTubeUrl(url);
    const documentType = isYoutube ? 'youtube' : 'url';
    
    logger.info(`Processing ${documentType}: ${url} for user: ${userId}`);
    
    const document = new Document({
      userId,
      title: title || url,
      content: '',
      summary: '',
      type: documentType,
      source: url,
      metadata: { url },
      status: 'processing',
    });

    await document.save();

    // Process URL synchronously and wait for indexing
    const processingResult = await processUrlSync(document._id, url, isYoutube);

    res.status(201).json({
      success: true,
      message: `${documentType} ${processingResult.status === 'completed' ? 'processed successfully' : 'processing failed'}`,
      data: {
        id: document._id,
        title: document.title,
        type: documentType,
        status: processingResult.status,
        url,
        error: processingResult.error,
      },
    });
  } catch (error) {
    logger.error('Error adding URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add URL',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Add text
export const addText = async (req: Request, res: Response) => {
  try {
    const { content, title, userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }
    
    logger.info(`Processing text: ${title} for user: ${userId}`);
    
    const document = new Document({
      userId,
      title,
      content: '',
      summary: '',
      type: 'text',
      source: 'direct_input',
      metadata: {
        length: content.length,
      },
      status: 'processing',
    });

    await document.save();

    // Process text synchronously and wait for indexing
    const processingResult = await processTextSync(document._id, content, title);

    res.status(201).json({
      success: true,
      message: `Text ${processingResult.status === 'completed' ? 'processed successfully' : 'processing failed'}`,
      data: {
        id: document._id,
        title: document.title,
        type: 'text',
        status: processingResult.status,
        error: processingResult.error,
      },
    });
  } catch (error) {
    logger.error('Error adding text:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add text',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Get single document by ID
export const getDocument = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    
    const filter: any = { _id: id };
    if (userId) filter.userId = userId;
    
    const document = await Document.findOne(filter);
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    res.json({
      success: true,
      data: document,
    });
  } catch (error) {
    logger.error('Error fetching document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch document',
    });
  }
};

// Delete document
export const deleteDocument = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    
    const filter: any = { _id: id };
    if (userId) filter.userId = userId;
    
    const document = await Document.findOneAndDelete(filter);
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete document',
    });
  }
};

// Synchronous processing functions that wait for indexing completion
async function processFileSync(
  documentId: string,
  filePath: string,
  originalName: string,
  mimeType: string
): Promise<{ status: 'completed' | 'failed'; error?: string }> {
  try {
    const processed = await documentProcessor.processFile(filePath, originalName, mimeType);
    
    await Document.findByIdAndUpdate(documentId, {
      title: processed.title,
      content: processed.content,
      summary: processed.summary,
      metadata: processed.metadata,
      chunks: processed.chunks,
      status: 'completed',
    });

    // Add to vector database and wait for completion
    const chunksForVector = processed.chunks.map(chunk => ({
      id: chunk.id,
      content: chunk.content,
      documentId: documentId,
      metadata: chunk.metadata,
    }));

    await vectorService.addChunks(chunksForVector);
    
    logger.info(`Successfully processed and indexed file: ${originalName}`);
    
    // Clean up uploaded file
    try {
      await fs.unlink(filePath);
    } catch (unlinkError) {
      logger.error(`Failed to delete processed file ${filePath}:`, unlinkError);
    }

    return { status: 'completed' };
  } catch (error) {
    logger.error(`Failed to process file ${originalName}:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await Document.findByIdAndUpdate(documentId, {
      status: 'failed',
      error: errorMessage,
    });
    
    // Clean up file on error
    try {
      await fs.unlink(filePath);
    } catch (unlinkError) {
      logger.error(`Failed to delete failed file ${filePath}:`, unlinkError);
    }

    return { status: 'failed', error: errorMessage };
  }
}

// Keep async version for backward compatibility if needed
async function processFileAsync(
  documentId: string,
  filePath: string,
  originalName: string,
  mimeType: string
) {
  await processFileSync(documentId, filePath, originalName, mimeType);
}

async function processUrlSync(documentId: string, url: string, isYoutube: boolean): Promise<{ status: 'completed' | 'failed'; error?: string }> {
  try {
    const processed = isYoutube 
      ? await documentProcessor.processYouTubeURL(url)
      : await documentProcessor.processURL(url);
    
    await Document.findByIdAndUpdate(documentId, {
      title: processed.title,
      content: processed.content,
      summary: processed.summary,
      metadata: processed.metadata,
      chunks: processed.chunks,
      status: 'completed',
    });

    // Add to vector database and wait for completion
    const chunksForVector = processed.chunks.map(chunk => ({
      id: chunk.id,
      content: chunk.content,
      documentId: documentId,
      metadata: chunk.metadata,
    }));

    await vectorService.addChunks(chunksForVector);
    
    logger.info(`Successfully processed and indexed ${isYoutube ? 'YouTube' : 'URL'}: ${url}`);
    return { status: 'completed' };
  } catch (error) {
    logger.error(`Failed to process ${isYoutube ? 'YouTube' : 'URL'} ${url}:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await Document.findByIdAndUpdate(documentId, {
      status: 'failed',
      error: errorMessage,
    });

    return { status: 'failed', error: errorMessage };
  }
}

// Keep async version for backward compatibility if needed
async function processUrlAsync(documentId: string, url: string, isYoutube: boolean) {
  await processUrlSync(documentId, url, isYoutube);
}

async function processTextSync(documentId: string, content: string, title: string): Promise<{ status: 'completed' | 'failed'; error?: string }> {
  try {
    const processed = await documentProcessor.processText(content, title);
    
    await Document.findByIdAndUpdate(documentId, {
      title: processed.title,
      content: processed.content,
      summary: processed.summary,
      metadata: processed.metadata,
      chunks: processed.chunks,
      status: 'completed',
    });

    // Add to vector database and wait for completion
    const chunksForVector = processed.chunks.map(chunk => ({
      id: chunk.id,
      content: chunk.content,
      documentId: documentId,
      metadata: chunk.metadata,
    }));

    await vectorService.addChunks(chunksForVector);
    
    logger.info(`Successfully processed and indexed text: ${title}`);
    return { status: 'completed' };
  } catch (error) {
    logger.error(`Failed to process text ${title}:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await Document.findByIdAndUpdate(documentId, {
      status: 'failed',
      error: errorMessage,
    });

    return { status: 'failed', error: errorMessage };
  }
}

// Keep async version for backward compatibility if needed
async function processTextAsync(documentId: string, content: string, title: string) {
  await processTextSync(documentId, content, title);
}

// Get documents for a user (renamed to avoid duplicate)
export const getUserDocuments = async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }

    // Use validated query parameters with defaults
    const validatedQuery = (req as any).validatedQuery || {};
    const { page = 1, limit = 10, sort = '-createdAt', type, status } = validatedQuery;
    
    const filter: any = { userId };
    if (type) filter.type = type;
    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    
    const documents = await Document.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .select('title summary type status metadata createdAt updatedAt');

    const total = await Document.countDocuments(filter);

    res.json({
      success: true,
      data: {
        documents,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch documents',
    });
  }
};

// Get document summary (for listing) - legacy endpoint
export const getDocumentSummary = async (req: Request, res: Response) => {
  try {
    // Use validated query parameters with defaults
    const validatedQuery = (req as any).validatedQuery || {};
    const { page = 1, limit = 10, sort = '-createdAt', type, status, userId } = validatedQuery;
    
    const filter: any = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (userId) filter.userId = userId;

    const skip = (page - 1) * limit;
    
    const documents = await Document.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .select('title summary type status metadata createdAt updatedAt');

    const total = await Document.countDocuments(filter);

    res.json({
      success: true,
      data: {
        documents,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching document summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch document summary',
    });
  }
};