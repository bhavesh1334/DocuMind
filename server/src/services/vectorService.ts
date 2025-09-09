import { QdrantClient } from "@qdrant/js-client-rest";
import { OpenAIEmbeddings } from "@langchain/openai";
import { logger } from "@/utils/logger";

class VectorService {
  private client: QdrantClient;
  private embeddings: OpenAIEmbeddings;
  private collectionName: string;
  private isInitialized: boolean = false;

  constructor() {
    const qdrantUrl = process.env.QDRANT_URL;
    console.log("qdrantUrl", qdrantUrl);
    this.client = qdrantUrl
      ? new QdrantClient({ url: qdrantUrl, apiKey: process.env.QDRANT_API_KEY })
      : new QdrantClient({
          host: process.env.QDRANT_HOST || "localhost",
          port: parseInt(process.env.QDRANT_PORT || "6333"),
          apiKey: process.env.QDRANT_API_KEY,
        });

    this.embeddings = new OpenAIEmbeddings({
      apiKey: process.env.OPENAI_API_KEY,
      model: "text-embedding-3-small",
      timeout: 30000, // 30 seconds timeout
      maxRetries: 2,
    });

    this.collectionName = process.env.QDRANT_COLLECTION_NAME || "documents";
  }

  async initialize(): Promise<void> {
    try {
      // Test connection to Qdrant
      await this.client.getCollections();
      logger.info("Connected to Qdrant vector database");

      // Check if collection exists
      const collections = await this.client.getCollections();
      const collectionExists = collections.collections.some(
        (col) => col.name === this.collectionName
      );

      if (!collectionExists) {
        // Create collection with proper vector configuration
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: 1536, // OpenAI text-embedding-3-small dimension
            distance: "Cosine",
          },
          optimizers_config: {
            default_segment_number: 2,
          },
          replication_factor: 1,
        });
        logger.info(`Created Qdrant collection: ${this.collectionName}`);
        
        // Create index for documentId field to enable filtering
        try {
          await this.client.createPayloadIndex(this.collectionName, {
            field_name: "documentId",
            field_schema: "keyword",
          });
          logger.info(`Created index for documentId field in collection: ${this.collectionName}`);
        } catch (indexError) {
          logger.error("Failed to create documentId index:", indexError);
          // Don't throw - collection is still usable without filtering
        }
      } else {
        logger.info(`Using existing Qdrant collection: ${this.collectionName}`);
        
        // Check if index exists and create it if missing
        try {
          const collectionInfo = await this.client.getCollection(this.collectionName);
          const hasDocumentIdIndex = collectionInfo.payload_schema?.documentId;
          
          if (!hasDocumentIdIndex) {
            logger.info("DocumentId index not found, creating it...");
            await this.client.createPayloadIndex(this.collectionName, {
              field_name: "documentId",
              field_schema: "keyword",
            });
            logger.info(`Created missing documentId index in collection: ${this.collectionName}`);
          }
        } catch (indexError) {
          logger.error("Failed to check/create documentId index:", indexError);
          // Don't throw - collection might still be usable
        }
      }

      this.isInitialized = true;
      logger.info("Vector service initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize vector service:", error);
      // Don't throw error in production to allow server to start without vector service
      if (process.env.NODE_ENV === "production") {
        logger.warn(
          "Continuing without vector service - some features may be unavailable"
        );
        this.isInitialized = false;
      } else {
        throw error;
      }
    }
  }

  async addChunks(
    chunks: Array<{
      id: string;
      content: string;
      documentId: string;
      metadata: Record<string, any>;
    }>
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const points = [];

      for (const chunk of chunks) {
        const embedding = await this.embeddings.embedQuery(chunk.content);

        points.push({
          id: chunk.id,
          vector: embedding,
          payload: {
            content: chunk.content,
            documentId: chunk.documentId,
            ...chunk.metadata,
          },
        });
      }

      if (points.length > 0) {
        await this.client.upsert(this.collectionName, {
          wait: true,
          points,
        });
        logger.info(`Added ${points.length} chunks to vector database`);
      }
    } catch (error) {
      logger.error("Failed to add chunks to vector database:", error);
      throw error;
    }
  }

  async searchSimilar(
    query: string,
    limit: number = 5,
    documentIds?: string[]
  ): Promise<
    Array<{
      id: string;
      content: string;
      score: number;
      documentId: string;
      metadata: Record<string, any>;
    }>
  > {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Validate and sanitize query
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('Search query is required and must be a non-empty string');
      }
      
      const sanitizedQuery = query.trim();
      const queryEmbedding = await this.embeddings.embedQuery(sanitizedQuery);

      const searchParams: any = {
        vector: queryEmbedding,
        limit,
        with_payload: true,
      };

      // Filter by document IDs if provided
      if (documentIds && documentIds.length > 0) {
        searchParams.filter = {
          must: [
            {
              key: "documentId",
              match: { any: documentIds },
            },
          ],
        };
      }

      let searchResult;
      try {
        searchResult = await this.client.search(
          this.collectionName,
          searchParams
        );
      } catch (searchError: any) {
        // If filtering fails due to missing index, try without filter
        if (searchError?.message?.includes('Index required') || 
            searchError?.data?.status?.error?.includes('Index required')) {
          logger.warn("DocumentId index missing, searching without document filter");
          
          // Remove filter and search all documents
          const fallbackParams = {
            vector: queryEmbedding,
            limit: documentIds && documentIds.length > 0 ? limit * 3 : limit, // Get more results to filter manually
            with_payload: true,
          };
          
          searchResult = await this.client.search(
            this.collectionName,
            fallbackParams
          );
          
          // Manually filter results by documentIds if provided
          if (documentIds && documentIds.length > 0) {
            searchResult = searchResult.filter(result => 
              documentIds.includes(result.payload?.documentId as string)
            ).slice(0, limit); // Limit to requested number
          }
        } else {
          throw searchError;
        }
      }

      return searchResult.map((result) => ({
        id: result.id as string,
        content: result.payload?.content as string,
        score: result.score,
        documentId: result.payload?.documentId as string,
        metadata: result.payload || {},
      }));
    } catch (error) {
      logger.error("Failed to search vector database:", error);
      
      // Handle specific error types
      const err: any = error;
      if (err?.message?.includes('timeout') || err?.code === 'ECONNABORTED') {
        throw new Error('Vector search timeout - please try again');
      } else if (err?.message?.includes('API key')) {
        throw new Error('OpenAI API key error during vector search');
      } else if (err?.message?.includes('rate limit')) {
        throw new Error('Rate limit exceeded - please wait and try again');
      }
      
      throw error;
    }
  }

  async deleteChunks(chunkIds: string[]): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        points: chunkIds,
      });
      logger.info(`Deleted ${chunkIds.length} chunks from vector database`);
    } catch (error) {
      logger.error("Failed to delete chunks from vector database:", error);
      throw error;
    }
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await this.client.delete(this.collectionName, {
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
      logger.info(`Deleted all chunks for document ${documentId}`);
    } catch (error: any) {
      // If filtering fails due to missing index, use alternative approach
      if (error?.message?.includes('Index required') || 
          error?.data?.status?.error?.includes('Index required')) {
        logger.warn("DocumentId index missing, using scroll and delete approach");
        
        try {
          // Get all points and filter manually
          const scrollResult = await this.client.scroll(this.collectionName, {
            limit: 1000,
            with_payload: true,
          });
          
          const pointsToDelete = scrollResult.points
            .filter(point => point.payload?.documentId === documentId)
            .map(point => point.id);
          
          if (pointsToDelete.length > 0) {
            await this.client.delete(this.collectionName, {
              wait: true,
              points: pointsToDelete,
            });
            logger.info(`Deleted ${pointsToDelete.length} chunks for document ${documentId} using fallback method`);
          } else {
            logger.info(`No chunks found for document ${documentId}`);
          }
        } catch (fallbackError) {
          logger.error(`Fallback deletion method also failed for document ${documentId}:`, fallbackError);
          throw fallbackError;
        }
      } else {
        logger.error(`Failed to delete chunks for document ${documentId}:`, error);
        throw error;
      }
    }
  }

  async getCollectionInfo(): Promise<any> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      return await this.client.getCollection(this.collectionName);
    } catch (error) {
      logger.error("Failed to get collection info:", error);
      throw error;
    }
  }
}

export const vectorService = new VectorService();

export const initializeQdrant = async (): Promise<void> => {
  await vectorService.initialize();
};
