import mongoose, { Document as MongoDocument, Schema } from 'mongoose';

export interface IDocument extends MongoDocument {
  _id: string;
  title: string;
  content: string;
  summary: string;
  type: 'file' | 'url' | 'youtube' | 'text';
  source: string;
  metadata: {
    fileSize?: number;
    mimeType?: string;
    url?: string;
    originalName?: string;
    pageCount?: number;
    duration?: number;
  };
  chunks: Array<{
    id: string;
    content: string;
    embedding?: number[];
    metadata: Record<string, any>;
  }>;
  status: 'processing' | 'completed' | 'failed';
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<IDocument>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    content: {
      type: String,
      required: true
    },
    summary: {
      type: String,
      required: true,
      maxlength: 1000
    },
    type: {
      type: String,
      enum: ['file', 'url', 'youtube', 'text'],
      required: true
    },
    source: {
      type: String,
      required: true
    },
    metadata: {
      fileSize: Number,
      mimeType: String,
      url: String,
      originalName: String,
      pageCount: Number,
      duration: Number
    },
    chunks: [{
      id: {
        type: String,
        required: true
      },
      content: {
        type: String,
        required: true
      },
      embedding: [Number],
      metadata: {
        type: Schema.Types.Mixed,
        default: {}
      }
    }],
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing'
    },
    error: String
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc: any, ret: any) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        // Don't include embeddings in JSON responses to save bandwidth
        if (ret.chunks) {
          ret.chunks = ret.chunks.map((chunk: any) => ({
            id: chunk.id,
            content: chunk.content.substring(0, 200) + '...',
            metadata: chunk.metadata
          }));
        }
        return ret;
      }
    }
  }
);

// Indexes for better performance
documentSchema.index({ type: 1, status: 1 });
documentSchema.index({ createdAt: -1 });
documentSchema.index({ 'chunks.id': 1 });

export const Document = mongoose.model<IDocument>('Document', documentSchema);