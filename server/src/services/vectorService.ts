import { QdrantVectorStore } from "@langchain/qdrant";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { logger } from "@/utils/logger";

// Types for better type safety
interface VectorChunk {
  id: string;
  content: string;
  documentId: string;
  metadata: Record<string, any>;
}

interface SearchResult {
  id: string;
  content: string;
  score: number;
  documentId: string;
  metadata: Record<string, any>;
}

interface VectorServiceConfig {
  qdrantUrl?: string;
  qdrantHost?: string;
  qdrantPort?: number;
  qdrantApiKey?: string;
  collectionName?: string;
  embeddingModel?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

class VectorService {
  private vectorStore: QdrantVectorStore | null = null;
  private embeddings: OpenAIEmbeddings;
  private textSplitter: RecursiveCharacterTextSplitter;
  private collectionName: string;
  private isInitialized: boolean = false;
  private config: VectorServiceConfig;

  constructor(config?: Partial<VectorServiceConfig>) {
    // Merge provided config with environment variables and defaults
    this.config = {
      qdrantUrl: config?.qdrantUrl || process.env.QDRANT_URL,
      qdrantHost: config?.qdrantHost || process.env.QDRANT_HOST || "localhost",
      qdrantPort: config?.qdrantPort || parseInt(process.env.QDRANT_PORT || "6333"),
      qdrantApiKey: config?.qdrantApiKey || process.env.QDRANT_API_KEY,
      collectionName: config?.collectionName || process.env.QDRANT_COLLECTION_NAME || "documents",
      embeddingModel: config?.embeddingModel || "text-embedding-3-small",
      chunkSize: config?.chunkSize || 1000,
      chunkOverlap: config?.chunkOverlap || 200,
      ...config
    };

    this.collectionName = this.config.collectionName!;
    
    // Initialize embeddings with enhanced configuration
    this.embeddings = new OpenAIEmbeddings({
      apiKey: process.env.OPENAI_API_KEY,
      model: this.config.embeddingModel!,
      timeout: 30000,
      maxRetries: 3,
      maxConcurrency: 5, // Improved concurrency for batch operations
    });

    // Initialize text splitter for better chunking
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.config.chunkSize!,
      chunkOverlap: this.config.chunkOverlap!,
      separators: ["\n\n", "\n", ".", "!", "?", ",", " ", ""],
    });

    logger.info("VectorService initialized with config:", {
      collectionName: this.collectionName,
      embeddingModel: this.config.embeddingModel,
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap
    });
  }

  /**
   * Initialize the vector store with retry logic and comprehensive error handling
   */
  async initialize(): Promise<void> {
    if (this.isInitialized && this.vectorStore) {
      return;
    }

    // Prevent multiple simultaneous initialization attempts
    if ((this as any)._initializing) {
      logger.info("Vector service initialization already in progress, waiting...");
      while ((this as any)._initializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    (this as any)._initializing = true;

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Initializing vector service (attempt ${attempt}/${maxRetries})...`);
        
        // Create Qdrant configuration
        const qdrantConfig: any = {
          collectionName: this.collectionName,
        };

        // Configure connection based on available settings
        if (this.config.qdrantUrl) {
          qdrantConfig.url = this.config.qdrantUrl;
          if (this.config.qdrantApiKey) {
            qdrantConfig.apiKey = this.config.qdrantApiKey;
          }
        } else {
          qdrantConfig.host = this.config.qdrantHost;
          qdrantConfig.port = this.config.qdrantPort;
          if (this.config.qdrantApiKey) {
            qdrantConfig.apiKey = this.config.qdrantApiKey;
          }
        }

        logger.info(`Connecting to Qdrant with config:`, {
          host: qdrantConfig.host,
          port: qdrantConfig.port,
          url: qdrantConfig.url,
          collectionName: qdrantConfig.collectionName,
          hasApiKey: !!qdrantConfig.apiKey
        });

        // First, test basic Qdrant connection
        const { QdrantClient } = await import('@qdrant/js-client-rest');
        const testClient = qdrantConfig.url 
          ? new QdrantClient({ url: qdrantConfig.url, apiKey: qdrantConfig.apiKey })
          : new QdrantClient({ 
              host: qdrantConfig.host, 
              port: qdrantConfig.port, 
              apiKey: qdrantConfig.apiKey 
            });

        // Test connection
        logger.info("Testing Qdrant connection...");
        const collections = await testClient.getCollections();
        logger.info(`Qdrant connection successful. Found ${collections.collections.length} collections`);

        try {
          // Try to initialize from existing collection first
          this.vectorStore = await QdrantVectorStore.fromExistingCollection(
            this.embeddings,
            qdrantConfig
          );
          logger.info("Successfully connected to existing Qdrant collection");
        } catch (existingError: any) {
          logger.warn(`Failed to connect to existing collection: ${existingError.message}`);
          
          // If collection doesn't exist, create it
          logger.info("Attempting to create new Qdrant collection...");
          this.vectorStore = await QdrantVectorStore.fromTexts(
            [], // Empty texts array
            [], // Empty metadata array
            this.embeddings,
            qdrantConfig
          );
          logger.info("Successfully created new Qdrant collection");
        }

        // Test the connection by getting collection info
        const collectionInfo = await this.getCollectionInfo();
        logger.info(`Collection info:`, {
          vectorsCount: collectionInfo.vectors_count,
          status: collectionInfo.status
        });
        
        this.isInitialized = true;
        (this as any)._initializing = false;
        logger.info("Vector service initialized successfully with LangChain QdrantVectorStore");
        return;
        
      } catch (error: any) {
        lastError = error;
        logger.error(`Vector service initialization attempt ${attempt} failed:`, {
          message: error.message,
          stack: error.stack,
          code: error.code,
          config: {
            host: this.config.qdrantHost,
            port: this.config.qdrantPort,
            url: this.config.qdrantUrl,
            collectionName: this.collectionName
          }
        });
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          logger.info(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Handle initialization failure
    logger.error("Failed to initialize vector service after all retries:", lastError);
    
    (this as any)._initializing = false;
    
    if (process.env.NODE_ENV === "production") {
      logger.warn("Continuing without vector service - some features may be unavailable");
      this.isInitialized = false;
    } else {
      throw lastError || new Error("Vector service initialization failed");
    }
  }

  /**
   * Add document chunks to the vector store with improved error handling and batch processing
   */
  async addChunks(chunks: VectorChunk[]): Promise<void> {
    if (!this.isInitialized || !this.vectorStore) {
      await this.initialize();
    }

    if (!this.vectorStore) {
      throw new Error("Vector store not initialized");
    }

    if (!chunks || chunks.length === 0) {
      logger.warn("No chunks provided to addChunks");
      return;
    }

    try {
      // Convert chunks to LangChain Document format
      const documents = chunks.map(chunk => new Document({
        pageContent: chunk.content,
        metadata: {
          id: chunk.id,
          documentId: chunk.documentId,
          ...chunk.metadata,
        },
      }));

      logger.info(`Converting ${chunks.length} chunks to documents with metadata:`, {
        sampleMetadata: documents[0]?.metadata,
        documentIds: [...new Set(chunks.map(c => c.documentId))]
      });

      // Process in batches to avoid memory issues and rate limits
      const batchSize = 50;
      const batches = [];
      
      for (let i = 0; i < documents.length; i += batchSize) {
        batches.push(documents.slice(i, i + batchSize));
      }

      logger.info(`Processing ${documents.length} chunks in ${batches.length} batches`);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchIds = batch.map(doc => doc.metadata.id);
        
        logger.info(`Processing batch ${i + 1}: ${batch.length} documents with IDs: ${batchIds.slice(0, 3).join(', ')}${batchIds.length > 3 ? '...' : ''}`);
        
        try {
          // Use direct Qdrant client for reliable storage
          const qdrantClient = (this.vectorStore as any).client;
          const points = [];
          
          for (const doc of batch) {
            const embedding = await this.embeddings.embedQuery(doc.pageContent);
            points.push({
              id: doc.metadata.id,
              vector: embedding,
              payload: {
                content: doc.pageContent,
                ...doc.metadata,
              },
            });
          }
          
          await qdrantClient.upsert(this.collectionName, {
            wait: true,
            points,
          });
          
          logger.info(`Successfully processed batch ${i + 1}/${batches.length} (${batch.length} chunks)`);
          
          // Verify the documents were actually added
          const testDocId = batch[0].metadata.documentId;
          const verifyResult = await qdrantClient.scroll(this.collectionName, {
            limit: 1,
            with_payload: true,
            filter: {
              must: [{ key: "documentId", match: { value: testDocId } }]
            }
          });
          logger.info(`Verification: Found ${verifyResult.points.length} documents for documentId ${testDocId}`);
          
        } catch (batchError: any) {
          logger.error(`Failed to process batch ${i + 1}:`, {
            message: batchError.message,
            stack: batchError.stack,
            batchSize: batch.length,
            sampleDoc: {
              content: batch[0]?.pageContent?.substring(0, 100),
              metadata: batch[0]?.metadata
            }
          });
          
          // Retry individual documents in the failed batch using direct Qdrant client
          const qdrantClient = (this.vectorStore as any).client;
          for (const doc of batch) {
            try {
              const embedding = await this.embeddings.embedQuery(doc.pageContent);
              await qdrantClient.upsert(this.collectionName, {
                wait: true,
                points: [{
                  id: doc.metadata.id,
                  vector: embedding,
                  payload: {
                    content: doc.pageContent,
                    ...doc.metadata,
                  },
                }],
              });
              logger.info(`Successfully added individual document ${doc.metadata.id}`);
            } catch (docError: any) {
              logger.error(`Failed to add individual document ${doc.metadata.id}:`, docError.message);
            }
          }
        }
        
        // Small delay between batches to respect rate limits
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      logger.info(`Successfully added ${chunks.length} chunks to vector database`);
    } catch (error: any) {
      logger.error("Failed to add chunks to vector database:", error.message);
      throw new Error(`Vector indexing failed: ${error.message}`);
    }
  }

  /**
   * Search for similar documents using LangChain's similarity search with enhanced filtering
   */
  async searchSimilar(
    query: string,
    limit: number = 5,
    documentIds?: string[]
  ): Promise<SearchResult[]> {
    if (!this.isInitialized || !this.vectorStore) {
      await this.initialize();
    }

    if (!this.vectorStore) {
      throw new Error("Vector store not initialized");
    }

    try {
      // Validate and sanitize query
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('Search query is required and must be a non-empty string');
      }
      
      const sanitizedQuery = query.trim();
      logger.info(`Searching for: "${sanitizedQuery}" with limit: ${limit}`);

      // Build filter for document IDs if provided
      let filter: any = undefined;
      if (documentIds && documentIds.length > 0) {
        // Use Qdrant's native filter format for LangChain
        filter = {
          must: [
            {
              key: "documentId",
              match: { any: documentIds }
            }
          ]
        };
        logger.info(`Filtering by document IDs: ${documentIds.join(', ')}`);
      }

      // Perform similarity search with LangChain
      const searchResults = await this.vectorStore.similaritySearchWithScore(
        sanitizedQuery,
        limit,
        filter
      );

      // Transform results to our expected format
      const formattedResults: SearchResult[] = searchResults.map(([doc, score]) => ({
        id: doc.metadata.id || '',
        content: doc.pageContent,
        score,
        documentId: doc.metadata.documentId || '',
        metadata: doc.metadata,
      }));

      logger.info(`Found ${formattedResults.length} similar documents`);
      return formattedResults;

    } catch (error: any) {
      logger.error("Failed to search vector database:", error.message);
      
      // Handle specific error types with user-friendly messages
      if (error.message?.includes('timeout') || error.code === 'ECONNABORTED') {
        throw new Error('Vector search timeout - please try a shorter query or try again');
      } else if (error.message?.includes('API key') || error.message?.includes('authentication')) {
        throw new Error('Authentication error during vector search - check API keys');
      } else if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
        throw new Error('Rate limit exceeded - please wait a moment and try again');
      } else if (error.message?.includes('connection') || error.message?.includes('network')) {
        throw new Error('Network error during vector search - check your connection');
      }
      
      throw new Error(`Vector search failed: ${error.message}`);
    }
  }

  /**
   * Delete specific chunks by their IDs
   */
  async deleteChunks(chunkIds: string[]): Promise<void> {
    if (!this.isInitialized || !this.vectorStore) {
      await this.initialize();
    }

    if (!this.vectorStore) {
      throw new Error("Vector store not initialized");
    }

    if (!chunkIds || chunkIds.length === 0) {
      logger.warn("No chunk IDs provided to deleteChunks");
      return;
    }

    try {
      // LangChain's QdrantVectorStore doesn't have a direct delete by IDs method
      // So we'll use the underlying client for this operation
      const qdrantClient = (this.vectorStore as any).client;
      
      await qdrantClient.delete(this.collectionName, {
        wait: true,
        points: chunkIds,
      });
      
      logger.info(`Successfully deleted ${chunkIds.length} chunks from vector database`);
    } catch (error: any) {
      logger.error("Failed to delete chunks from vector database:", error.message);
      throw new Error(`Failed to delete chunks: ${error.message}`);
    }
  }

  /**
   * Delete all chunks associated with a specific document ID
   */
  async deleteByDocumentId(documentId: string): Promise<void> {
    if (!this.isInitialized || !this.vectorStore) {
      await this.initialize();
    }

    if (!this.vectorStore) {
      throw new Error("Vector store not initialized");
    }

    if (!documentId) {
      throw new Error("Document ID is required");
    }

    try {
      logger.info(`Deleting all chunks for document: ${documentId}`);
      
      // Use the underlying Qdrant client for deletion by filter
      const qdrantClient = (this.vectorStore as any).client;
      
      try {
        // Try to delete using filter first (requires index)
        await qdrantClient.delete(this.collectionName, {
          wait: true,
          filter: {
            must: [
              {
                key: "documentId",
                match: { value: documentId },
              },
            ],
          },
        });
        
        logger.info(`Successfully deleted all chunks for document ${documentId}`);
        
      } catch (filterError: any) {
        // Fallback: scroll through all points and delete matching ones
        logger.warn(`Filter-based deletion failed, using fallback method: ${filterError.message}`);
        
        const scrollResult = await qdrantClient.scroll(this.collectionName, {
          limit: 1000,
          with_payload: true,
        });
        
        const pointsToDelete = scrollResult.points
          .filter((point: any) => point.payload?.documentId === documentId)
          .map((point: any) => point.id);
        
        if (pointsToDelete.length > 0) {
          await qdrantClient.delete(this.collectionName, {
            wait: true,
            points: pointsToDelete,
          });
          logger.info(`Deleted ${pointsToDelete.length} chunks for document ${documentId} using fallback method`);
        } else {
          logger.info(`No chunks found for document ${documentId}`);
        }
      }
      
    } catch (error: any) {
      logger.error(`Failed to delete chunks for document ${documentId}:`, error.message);
      throw new Error(`Failed to delete document chunks: ${error.message}`);
    }
  }

  /**
   * Get collection information and statistics
   */
  async getCollectionInfo(): Promise<any> {
    if (!this.vectorStore) {
      throw new Error("Vector store not initialized");
    }

    try {
      const qdrantClient = (this.vectorStore as any).client;
      const collectionInfo = await qdrantClient.getCollection(this.collectionName);
      
      return collectionInfo;
      
    } catch (error: any) {
      logger.error("Failed to get collection info:", error.message);
      throw new Error(`Failed to get collection info: ${error.message}`);
    }
  }

  /**
   * Split text into optimized chunks using LangChain's text splitter
   */
  async splitText(text: string, metadata: Record<string, any> = {}): Promise<Document[]> {
    if (!text || text.trim().length === 0) {
      return [];
    }

    try {
      const documents = await this.textSplitter.createDocuments([text], [metadata]);
      logger.info(`Split text into ${documents.length} chunks`);
      return documents;
    } catch (error: any) {
      logger.error("Failed to split text:", error.message);
      throw new Error(`Text splitting failed: ${error.message}`);
    }
  }

  /**
   * Add documents from text with automatic chunking
   */
  async addDocumentsFromText(
    text: string,
    documentId: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    if (!text || !documentId) {
      throw new Error("Text and document ID are required");
    }

    try {
      // Split text into chunks
      const documents = await this.splitText(text, {
        documentId,
        ...metadata,
      });

      if (documents.length === 0) {
        logger.warn(`No chunks created from text for document ${documentId}`);
        return;
      }

      // Convert to VectorChunk format
      const chunks: VectorChunk[] = documents.map((doc, index) => ({
        id: `${documentId}_chunk_${index}`,
        content: doc.pageContent,
        documentId,
        metadata: doc.metadata,
      }));

      // Add chunks to vector store
      await this.addChunks(chunks);
      
    } catch (error: any) {
      logger.error(`Failed to add documents from text for ${documentId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get service health and configuration info
   */
  getServiceInfo(): {
    isInitialized: boolean;
    config: VectorServiceConfig;
    collectionName: string;
  } {
    return {
      isInitialized: this.isInitialized,
      config: this.config,
      collectionName: this.collectionName,
    };
  }
}

// Export singleton instance
export const vectorService = new VectorService();

// Export initialization function for backward compatibility
export const initializeQdrant = async (): Promise<void> => {
  await vectorService.initialize();
};

// Export types for external use
export type { VectorChunk, SearchResult, VectorServiceConfig };
