import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import csv from 'csv-parser';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { YoutubeTranscript } from 'youtube-transcript';
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
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '. ', '! ', '? ', ' ', ''],
    });

    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'gpt-3.5-turbo',
      temperature: 0.3,
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

  async processYouTubeURL(url: string): Promise<ProcessedDocument> {
    try {
      const videoId = this.extractYouTubeVideoId(url);
      if (!videoId) {
        throw new Error('Invalid YouTube URL');
      }

      // Get transcript
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      const content = transcript.map(entry => entry.text).join(' ');
      
      if (!content || content.trim().length === 0) {
        throw new Error('No transcript available for this video');
      }

      // Extract video title (simplified - in production, you might want to use YouTube API)
      let title = `YouTube Video (${videoId})`;
      try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const pageTitle = $('title').text();
        if (pageTitle && pageTitle !== 'YouTube') {
          title = pageTitle.replace(' - YouTube', '');
        }
      } catch {
        // Fallback to default title if extraction fails
      }

      const metadata = {
        url,
        videoId,
        platform: 'youtube',
        duration: transcript.length > 0 ? transcript[transcript.length - 1].offset : 0,
        transcriptLength: transcript.length,
      };

      return await this.processContent(content, title, metadata);
    } catch (error) {
      logger.error(`Error processing YouTube URL ${url}:`, error);
      throw error;
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
      // Limit content length for summary generation
      const limitedContent = content.substring(0, 4000);
      
      const response = await this.llm.invoke([
        {
          role: 'system',
          content: `You are a helpful assistant that creates concise summaries. 
                   Create a summary that captures the main points and key information.
                   Keep it under 300 words and make it informative.`,
        },
        {
          role: 'user',
          content: `Please summarize the following text:\n\n${limitedContent}`,
        },
      ]);

      return response.content as string;
    } catch (error) {
      logger.error('Error generating summary:', error);
      // Fallback to simple truncation if LLM fails
      return content.substring(0, 300) + '...';
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
}

export const documentProcessor = new DocumentProcessor();