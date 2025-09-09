import { QdrantClient } from "@qdrant/js-client-rest";
import { OpenAIEmbeddings } from "@langchain/openai";
import { logger } from "@/utils/logger";

class VectorService {
  private client: QdrantClient;
  private embeddings: OpenAIEmbeddings;
  private collectionName: string;
  private isInitialized: boolean = false;

  constructor() {
    this.client = new QdrantClient({
      apiKey: process.env.QDRANT_API_KEY,
      host: process.env.QDRANT_HOST || "localhost",
      port: parseInt(process.env.QDRANT_PORT || "6333"),
    });

    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "text-embedding-3-small",
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
      } else {
        logger.info(`Using existing Qdrant collection: ${this.collectionName}`);
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
      const queryEmbedding = await this.embeddings.embedQuery(query);

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

      const searchResult = await this.client.search(
        this.collectionName,
        searchParams
      );

      return searchResult.map((result) => ({
        id: result.id as string,
        content: result.payload?.content as string,
        score: result.score,
        documentId: result.payload?.documentId as string,
        metadata: result.payload || {},
      }));
    } catch (error) {
      logger.error("Failed to search vector database:", error);
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
    } catch (error) {
      logger.error(
        `Failed to delete chunks for document ${documentId}:`,
        error
      );
      throw error;
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
