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
  
  if (!files || files.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No files uploaded',
    });
  }

  const results = [];
  const errors = [];

  for (const file of files) {
    try {
      logger.info(`Processing file: ${file.originalname}`);
      
      // Create document record
      const document = new Document({
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

      // Process file in background
      processFileAsync(document._id, file.path, file.originalname, file.mimetype);
      
      results.push({
        id: document._id,
        title: document.title,
        status: 'processing',
        originalName: file.originalname,
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
    const { url, title } = req.body;
    
    // Determine if it's a YouTube URL
    const isYoutube = isYouTubeUrl(url);
    const documentType = isYoutube ? 'youtube' : 'url';
    
    logger.info(`Processing ${documentType}: ${url}`);
    
    const document = new Document({
      title: title || url,
      content: '',
      summary: '',
      type: documentType,
      source: url,
      metadata: { url },
      status: 'processing',
    });

    await document.save();

    // Process URL in background
    processUrlAsync(document._id, url, isYoutube);

    res.status(201).json({
      success: true,
      message: `${documentType} added and processing started`,
      data: {
        id: document._id,
        title: document.title,
        type: documentType,
        status: 'processing',
        url,
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
    const { content, title } = req.body;
    
    logger.info(`Processing text: ${title}`);
    
    const document = new Document({
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

    // Process text in background
    processTextAsync(document._id, content, title);

    res.status(201).json({
      success: true,
      message: 'Text added and processing started',
      data: {
        id: document._id,
        title: document.title,
        type: 'text',
        status: 'processing',
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

// Get all documents
export const getDocuments = async (req: Request, res: Response) => {
  try {
    const { page, limit, sort, type, status } = req.query as any;
    
    const filter: any = {};
    if (type) filter.type = type;
    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    
    const [documents, total] = await Promise.all([
      Document.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select('-content -chunks.content -chunks.embedding'),
      Document.countDocuments(filter),
    ]);

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

// Get single document
export const getDocument = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const document = await Document.findById(id);
    
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
    
    const document = await Document.findById(id);
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    // Delete from vector database
    try {
      await vectorService.deleteByDocumentId(id);
      logger.info(`Deleted vector embeddings for document ${id}`);
    } catch (vectorError) {
      logger.error(`Failed to delete vectors for document ${id}:`, vectorError);
      // Continue with deletion even if vector cleanup fails
    }

    // Delete file if it's a file upload
    if (document.type === 'file' && document.source) {
      try {
        const uploadDir = process.env.UPLOAD_DIR || 'uploads';
        const filePath = path.join(uploadDir, document.source);
        await fs.unlink(filePath);
        logger.info(`Deleted file: ${filePath}`);
      } catch (fileError) {
        logger.error(`Failed to delete file for document ${id}:`, fileError);
        // Continue with deletion even if file cleanup fails
      }
    }

    // Delete document from database
    await Document.findByIdAndDelete(id);

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

// Background processing functions
async function processFileAsync(
  documentId: string,
  filePath: string,
  originalName: string,
  mimeType: string
) {
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

    // Add to vector database
    const chunksForVector = processed.chunks.map(chunk => ({
      id: chunk.id,
      content: chunk.content,
      documentId: documentId,
      metadata: chunk.metadata,
    }));

    await vectorService.addChunks(chunksForVector);
    
    logger.info(`Successfully processed file: ${originalName}`);
    
    // Clean up uploaded file
    try {
      await fs.unlink(filePath);
    } catch (unlinkError) {
      logger.error(`Failed to delete processed file ${filePath}:`, unlinkError);
    }
  } catch (error) {
    logger.error(`Failed to process file ${originalName}:`, error);
    
    await Document.findByIdAndUpdate(documentId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    // Clean up file on error
    try {
      await fs.unlink(filePath);
    } catch (unlinkError) {
      logger.error(`Failed to delete failed file ${filePath}:`, unlinkError);
    }
  }
}

async function processUrlAsync(documentId: string, url: string, isYoutube: boolean) {
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

    // Add to vector database
    const chunksForVector = processed.chunks.map(chunk => ({
      id: chunk.id,
      content: chunk.content,
      documentId: documentId,
      metadata: chunk.metadata,
    }));

    await vectorService.addChunks(chunksForVector);
    
    logger.info(`Successfully processed ${isYoutube ? 'YouTube' : 'URL'}: ${url}`);
  } catch (error) {
    logger.error(`Failed to process ${isYoutube ? 'YouTube' : 'URL'} ${url}:`, error);
    
    await Document.findByIdAndUpdate(documentId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function processTextAsync(documentId: string, content: string, title: string) {
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

    // Add to vector database
    const chunksForVector = processed.chunks.map(chunk => ({
      id: chunk.id,
      content: chunk.content,
      documentId: documentId,
      metadata: chunk.metadata,
    }));

    await vectorService.addChunks(chunksForVector);
    
    logger.info(`Successfully processed text: ${title}`);
  } catch (error) {
    logger.error(`Failed to process text ${title}:`, error);
    
    await Document.findByIdAndUpdate(documentId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Get document summary (for listing)
export const getDocumentSummary = async (req: Request, res: Response) => {
  try {
    const { page, limit, sort, type, status } = req.query as any;
    
    const filter: any = {};
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
    logger.error('Error fetching document summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch document summary',
    });
  }
};