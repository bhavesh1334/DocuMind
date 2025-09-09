import { ChatOpenAI } from "@langchain/openai";
import { vectorService } from "./vectorService";
import { logger } from "@/utils/logger";

export interface ChatContext {
  documentIds?: string[];
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface ChatResponse {
  content: string;
  sources: string[];
  retrievedChunks: Array<{
    documentId: string;
    chunkId: string;
    content: string;
    score: number;
  }>;
  enhancedQuery: string;
}

class ChatService {
  private llm: ChatOpenAI;
  private queryEnhancerLLM: ChatOpenAI;

  constructor() {
    this.llm = new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4o-mini",
      temperature: 0.7,
      maxTokens: 1000,
      timeout: 30000, // 30 seconds timeout
      maxRetries: 2,
    });

    this.queryEnhancerLLM = new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 200,
      timeout: 15000, // 15 seconds timeout
      maxRetries: 2,
    });
  }

  async enhanceQuery(
    query: string,
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<string> {
    try {
      let contextualPrompt = `Based on the conversation history and user query, enhance and rephrase the query to be more specific and searchable while maintaining the original intent.

User query: "${query}"`;

      if (conversationHistory && conversationHistory.length > 0) {
        const recentHistory = conversationHistory.slice(-6); // Last 3 exchanges
        const historyText = recentHistory
          .map((msg) => `${msg.role}: ${msg.content}`)
          .join("\n");

        contextualPrompt += `\n\nRecent conversation context:\n${historyText}`;
      }

      contextualPrompt += `\n\nEnhanced query:`;

      const response = await this.queryEnhancerLLM.invoke([
        {
          role: "system",
          content: `You are a query enhancement specialist. Your job is to improve search queries by:
1. Adding relevant context from conversation history
2. Expanding abbreviations and acronyms
3. Making implicit concepts explicit
4. Maintaining the original user intent
5. Keeping the enhanced query concise but comprehensive

Return only the enhanced query without any explanations.`,
        },
        {
          role: "user",
          content: contextualPrompt,
        },
      ]);

      const enhancedQuery = (
        Array.isArray((response as any).content)
          ? (response as any).content
              .map((c: any) => (typeof c === "string" ? c : c?.text || ""))
              .join("")
          : ((response as any).content as string)
      ).trim();
      logger.info(`Query enhanced: "${query}" -> "${enhancedQuery}"`);

      return enhancedQuery;
    } catch (error) {
      logger.error("Error enhancing query:", error);
      return query; // Fallback to original query
    }
  }

  async chat(query: string, context: ChatContext = {}): Promise<ChatResponse> {
    try {
      const { documentIds, conversationHistory } = context;

      if (!process.env.OPENAI_API_KEY) {
        throw new Error(
          "Missing OPENAI_API_KEY. Set the environment variable to enable LLM and embeddings."
        );
      }

      // Validate query input
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new Error("Query is required and must be a non-empty string");
      }

      // Truncate very long queries to prevent API issues
      const truncatedQuery = query.length > 4000 ? query.substring(0, 4000) + "..." : query;

      // Step 1: Enhance the query
      const enhancedQuery = await this.enhanceQuery(truncatedQuery, conversationHistory);

      // Step 2: Retrieve relevant chunks
      const retrievedChunks = await vectorService.searchSimilar(
        enhancedQuery,
        8, // Retrieve more chunks for better context
        documentIds
      );

      if (retrievedChunks.length === 0) {
        return {
          content:
            "I couldn't find any relevant information in the uploaded documents to answer your question. Please make sure your query is related to the content you've shared, or try rephrasing your question.",
          sources: [],
          retrievedChunks: [],
          enhancedQuery,
        };
      }

      // Step 3: Prepare context for LLM
      const relevantContext = retrievedChunks
        .filter((chunk) => chunk.score > 0.1) // Lower threshold for better recall
        .map((chunk, index) => `[Source ${index + 1}]: ${chunk.content}`)
        .join("\n\n");

      // Step 4: Generate response using LLM
      const systemPrompt = `You are a helpful AI assistant that answers questions based on the provided context from documents. 

Guidelines:
1. Answer questions using ONLY the information provided in the context
2. If the context doesn't contain enough information to answer fully, acknowledge this limitation
3. Be specific and cite relevant parts of the context when possible
4. Provide comprehensive answers when the information is available
5. If asked about something not in the context, politely explain that you can only answer based on the provided documents
6. Maintain a helpful and conversational tone
7. Structure your response clearly with relevant details

Context from documents:
${relevantContext}`;

      let conversationContext = "";
      if (conversationHistory && conversationHistory.length > 0) {
        const recentHistory = conversationHistory.slice(-4); // Last 2 exchanges
        conversationContext = recentHistory
          .map(
            (msg) =>
              `${msg.role === "user" ? "Human" : "Assistant"}: ${msg.content}`
          )
          .join("\n");
        conversationContext = `\n\nRecent conversation:\n${conversationContext}\n`;
      }

      const userPrompt = `${conversationContext}Human: ${truncatedQuery}

Please answer this question based on the provided context.`;

      const response = await this.llm.invoke([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);

      // Extract unique source document IDs
      const sources = Array.from(
        new Set(retrievedChunks.map((chunk) => chunk.documentId))
      );

      const content = Array.isArray((response as any).content)
        ? (response as any).content
            .map((c: any) => (typeof c === "string" ? c : c?.text || ""))
            .join("")
        : ((response as any).content as string);

      return {
        content,
        sources,
        retrievedChunks: retrievedChunks.map((chunk) => ({
          documentId: chunk.documentId,
          chunkId: chunk.id,
          content: chunk.content.substring(0, 200) + "...", // Truncate for response
          score: chunk.score,
        })),
        enhancedQuery,
      };
    } catch (error) {
      logger.error("Error in chat service:", error);
      const err: any = error;
      const baseMessage = "Failed to generate response";
      
      // Handle different types of errors
      let status: number | undefined;
      let errorMessage: string;
      
      if (err?.response) {
        // HTTP response error
        status = err.response.status;
        errorMessage = err.response.data?.error?.message || 
                      err.response.data?.message || 
                      err.response.statusText || 
                      'HTTP request failed';
      } else if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
        // Timeout error
        errorMessage = 'Request timeout - please try again';
        status = 408;
      } else if (err?.code === 'ENOTFOUND' || err?.code === 'ECONNREFUSED') {
        // Network error
        errorMessage = 'Network connection failed';
        status = 503;
      } else if (err?.message?.includes('API key')) {
        // API key error
        errorMessage = 'Invalid or missing API key';
        status = 401;
      } else {
        // Generic error
        errorMessage = err?.message || 'Unknown error occurred';
      }

      const parts = [errorMessage];
      if (status) parts.unshift(`HTTP ${status}`);

      throw new Error(`${baseMessage}. Reason: ${parts.join(" - ")}`);
    }
  }

  async generateTitle(firstMessage: string): Promise<string> {
    try {
      const response = await this.queryEnhancerLLM.invoke([
        {
          role: "system",
          content: `Generate a concise, descriptive title (max 50 characters) for a chat conversation based on the first user message. The title should capture the main topic or question.`,
        },
        {
          role: "user",
          content: `First message: "${firstMessage}"\n\nTitle:`,
        },
      ]);

      return (response.content as string).trim().replace(/^["']|["']$/g, "");
    } catch (error) {
      logger.error("Error generating chat title:", error);
      return firstMessage.substring(0, 50).trim() + "...";
    }
  }
}

export const chatService = new ChatService();
