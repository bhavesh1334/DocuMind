import mongoose, { Document as MongoDocument, Schema } from 'mongoose';

export interface IMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    sources?: string[];
    retrievedChunks?: Array<{
      documentId: string;
      chunkId: string;
      content: string;
      score: number;
    }>;
    enhancedQuery?: string;
  };
}

export interface IChat extends MongoDocument {
  _id: string;
  userId: mongoose.Types.ObjectId;
  title: string;
  messages: IMessage[];
  documentIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  metadata: {
    sources: [String],
    retrievedChunks: [{
      documentId: String,
      chunkId: String,
      content: String,
      score: Number
    }],
    enhancedQuery: String
  }
}, { _id: false });

const chatSchema = new Schema<IChat>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    messages: [messageSchema],
    documentIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Document'
    }]
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc: any, ret: any) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Indexes
chatSchema.index({ userId: 1, createdAt: -1 });
chatSchema.index({ userId: 1, documentIds: 1 });
chatSchema.index({ createdAt: -1 });

export const Chat = mongoose.model<IChat>('Chat', chatSchema);