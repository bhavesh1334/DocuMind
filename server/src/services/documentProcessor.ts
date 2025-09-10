import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import csv from 'csv-parser';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { YoutubeLoader } from '@langchain/community/document_loaders/web/youtube';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { ChatOpenAI } from '@langchain/openai';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';

import { logger } from '@/utils/logger';

export interface ProcessedDocument {
  title: string;
  content: string;
  summary: string;
  metadata: Record<string, any>;
  chunks: Array<{
    id: string;
    content: string;
    metadata: Record<string, any>;
  }>;
}

class DocumentProcessor {
  private textSplitter: RecursiveCharacterTextSplitter;
  private llm: ChatOpenAI;

  constructor() {
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 800, // Reduced for faster processing
      chunkOverlap: 150, // Reduced overlap
      separators: ['\n\n', '\n', '. ', '! ', '? ', ' ', ''],
    });

    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'gpt-3.5-turbo',
      temperature: 0.3,
      timeout: 15000, // Faster timeout
      maxRetries: 1, // Fewer retries for speed
    });
  }

  async processFile(filePath: string, originalName: string, mimeType: string): Promise<ProcessedDocument> {
    try {
      let content: string;
      let title = path.parse(originalName).name;
      const metadata: Record<string, any> = {
        originalName,
        mimeType,
        fileSize: (await fs.stat(filePath)).size,
      };

      switch (mimeType) {
        case 'application/pdf':
          content = await this.extractFromPDF(filePath);
          break;
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        case 'application/msword':
          content = await this.extractFromWord(filePath);
          break;
        case 'text/csv':
          content = await this.extractFromCSV(filePath);
          break;
        case 'text/plain':
        case 'text/markdown':
          content = await fs.readFile(filePath, 'utf-8');
          break;
        default:
          throw new Error(`Unsupported file type: ${mimeType}`);
      }

      if (!content || content.trim().length === 0) {
        throw new Error('No text content could be extracted from the file');
      }

      return await this.processContent(content, title, metadata);
    } catch (error) {
      logger.error(`Error processing file ${originalName}:`, error);
      throw error;
    }
  }

  async processURL(url: string): Promise<ProcessedDocument> {
    try {
      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DocumentProcessor/1.0)',
        },
      });

      const $ = cheerio.load(response.data);
      
      // Remove script and style elements
      $('script, style, nav, footer, aside, .ad, .advertisement').remove();
      
      // Extract title
      const title = $('title').text().trim() || $('h1').first().text().trim() || 'Web Page';
      
      // Extract main content
      let content = '';
      const contentSelectors = ['main', 'article', '.content', '.post', '.entry'];
      
      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0 && element.text().trim().length > 100) {
          content = element.text().trim();
          break;
        }
      }
      
      // Fallback to body if no main content found
      if (!content) {
        content = $('body').text().trim();
      }
      
      // Clean up whitespace
      content = content.replace(/\s+/g, ' ').trim();
      
      if (!content || content.length < 50) {
        throw new Error('Insufficient content extracted from URL');
      }

      const metadata = {
        url,
        domain: new URL(url).hostname,
        extractedAt: new Date().toISOString(),
      };

      return await this.processContent(content, title, metadata);
    } catch (error) {
      logger.error(`Error processing URL ${url}:`, error);
      throw error;
    }
  }

  async processYouTubeURL(url: string, options?: { language?: string; country?: string }): Promise<ProcessedDocument> {
    try {
      const videoId = this.extractYouTubeVideoId(url);
      if (!videoId) {
        throw new Error('Invalid YouTube URL');
      }

      // Use LangChain YoutubeLoader to fetch transcript and video info
      const loaderOptions = {
        language: options?.language || 'en',
        addVideoInfo: true,
      };

      const loader = YoutubeLoader.createFromUrl(url, loaderOptions);
      const docs = await loader.load();

      if (!docs || docs.length === 0) {
        throw new Error('No content could be loaded from the YouTube video');
      }

      const doc = docs[0];
      const { pageContent, metadata: docMetadata } = doc;

      // Extract title from metadata or use fallback
      const title = docMetadata.title || docMetadata.source || `YouTube Video (${videoId})`;
      
      // Format content with video information
      let content = '';
      if (docMetadata.title) {
        content += `Title: ${docMetadata.title}\n`;
      }
      if (docMetadata.author) {
        content += `Channel: ${docMetadata.author}\n`;
      }
      if (docMetadata.length) {
        content += `Duration: ${this.formatDuration(docMetadata.length)}\n`;
      }
      if (docMetadata.description) {
        content += `Description: ${docMetadata.description}\n`;
      }
      
      content += `\nTranscript:\n${pageContent}`;
      
      // Prepare metadata for processing
      const metadata = {
        url,
        videoId,
        platform: 'youtube',
        title: docMetadata.title,
        author: docMetadata.author,
        description: docMetadata.description,
        duration: docMetadata.length || 0,
        durationFormatted: docMetadata.length ? this.formatDuration(docMetadata.length) : 'Unknown',
        language: options?.language || 'en',
        hasTranscript: pageContent && pageContent.trim().length > 0,
        extractedAt: new Date().toISOString(),
        source: docMetadata.source,
      };

      return await this.processContent(content, title, metadata);
    } catch (error) {
      logger.error(`Error processing YouTube URL ${url}:`, error);
      
      // Fallback: try to extract basic info from the URL
      try {
        const videoId = this.extractYouTubeVideoId(url);
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const pageTitle = $('title').text();
        const title = pageTitle && pageTitle !== 'YouTube' ? pageTitle.replace(' - YouTube', '') : `YouTube Video (${videoId})`;
        const metaDescription = $('meta[name="description"]').attr('content') || '';
        
        const fallbackContent = `Title: ${title}\nDescription: ${metaDescription}\n\nNote: Transcript could not be loaded for this video. This may be due to privacy settings, unavailable captions, or other restrictions.`;
        
        const fallbackMetadata = {
          url,
          videoId,
          platform: 'youtube',
          title,
          description: metaDescription,
          hasTranscript: false,
          fallbackContent: true,
          extractedAt: new Date().toISOString(),
        };
        
        return await this.processContent(fallbackContent, title, fallbackMetadata);
      } catch (fallbackError) {
        logger.error(`Fallback processing also failed for ${url}:`, fallbackError);
        throw new Error(`Failed to process YouTube video: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  async processText(text: string, title?: string): Promise<ProcessedDocument> {
    try {
      const processedTitle = title || text.substring(0, 50).trim() + '...';
      const metadata = {
        type: 'text',
        length: text.length,
      };

      return await this.processContent(text, processedTitle, metadata);
    } catch (error) {
      logger.error('Error processing text:', error);
      throw error;
    }
  }

  private async processContent(
    content: string,
    title: string,
    metadata: Record<string, any>
  ): Promise<ProcessedDocument> {
    try {
      // Generate summary
      const summary = await this.generateSummary(content);
      
      // Split into chunks
      const textChunks = await this.textSplitter.splitText(content);
      
      const chunks = textChunks.map((chunk, index) => ({
        id: uuidv4(),
        content: chunk,
        metadata: {
          index,
          chunkSize: chunk.length,
          ...metadata,
        },
      }));

      return {
        title: title.substring(0, 500), // Limit title length
        content,
        summary,
        metadata,
        chunks,
      };
    } catch (error) {
      logger.error('Error processing content:', error);
      throw error;
    }
  }

  private async generateSummary(content: string): Promise<string> {
    try {
      // Limit content length for faster processing
      const limitedContent = content.substring(0, 2000); // Reduced from 4000
      
      const response = await this.llm.invoke([
        {
          role: 'system',
          content: `Create a concise 2-3 sentence summary capturing the main points. Keep it under 150 words.`,
        },
        {
          role: 'user',
          content: `Summarize: ${limitedContent}`,
        },
      ]);

      return response.content as string;
    } catch (error) {
      logger.error('Error generating summary:', error);
      // Fallback to simple truncation if LLM fails
      return content.substring(0, 200) + '...';
    }
  }

  private async extractFromPDF(filePath: string): Promise<string> {
    try {
      const buffer = await fs.readFile(filePath);
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      logger.error('Error extracting from PDF:', error);
      throw new Error('Failed to extract text from PDF');
    }
  }

  private async extractFromWord(filePath: string): Promise<string> {
    try {
      const buffer = await fs.readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      logger.error('Error extracting from Word document:', error);
      throw new Error('Failed to extract text from Word document');
    }
  }

  private async extractFromCSV(filePath: string): Promise<string> {
    try {
      const results: any[] = [];
      const stream = createReadStream(filePath);
      
      return new Promise((resolve, reject) => {
        stream
          .pipe(csv())
          .on('data', (data: Record<string, any>) => results.push(data))
          .on('end', () => {
            try {
              // Convert CSV data to readable text
              let content = '';
              if (results.length > 0) {
                const headers = Object.keys(results[0]);
                content += `CSV Data with columns: ${headers.join(', ')}\n\n`;
                
                results.forEach((row, index) => {
                  content += `Row ${index + 1}:\n`;
                  headers.forEach(header => {
                    content += `${header}: ${row[header]}\n`;
                  });
                  content += '\n';
                });
              }
              resolve(content);
            } catch (error) {
              reject(error);
            }
          })
          .on('error', reject);
      });
    } catch (error) {
      logger.error('Error extracting from CSV:', error);
      throw new Error('Failed to extract text from CSV');
    }
  }

  private extractYouTubeVideoId(url: string): string | null {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[7].length === 11 ? match[7] : null;
  }

  private formatTimestamp(offsetMs: number): string {
    const totalSeconds = Math.floor(offsetMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  private formatDuration(durationSeconds: number): string {
    const hours = Math.floor(durationSeconds / 3600);
    const minutes = Math.floor((durationSeconds % 3600) / 60);
    const seconds = durationSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

export const documentProcessor = new DocumentProcessor();