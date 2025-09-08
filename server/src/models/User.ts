import mongoose, { Document as MongoDocument, Schema } from 'mongoose';

export interface IUser extends MongoDocument {
  _id: string;
  name: string;
  username: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: /^@[a-z0-9_]+$/,
      maxlength: 50
    }
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
userSchema.index({ username: 1 });
userSchema.index({ createdAt: -1 });

// Static method to generate unique username
userSchema.statics.generateUsername = async function(name: string): Promise<string> {
  const baseUsername = name.toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove special characters
    .substring(0, 20); // Limit length
  
  let username = `@${baseUsername}`;
  let counter = Math.floor(Math.random() * 9000) + 1000; // Random 4-digit number
  
  // Check if username exists and increment counter if needed
  while (await this.findOne({ username: `${username}${counter}` })) {
    counter = Math.floor(Math.random() * 9000) + 1000;
  }
  
  return `${username}${counter}`;
};

export const User = mongoose.model<IUser>('User', userSchema);
