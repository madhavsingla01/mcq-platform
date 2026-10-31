import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    text: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'audio', 'document', 'quiz_share', 'comment_share', 'challenge_invite', 'link'],
      default: 'text',
    },
    media: {
      url: { type: String, default: null },
      thumbnailUrl: { type: String, default: null },
      fileName: { type: String, default: null },
      fileSize: { type: Number, default: null },
      mimeType: { type: String, default: null },
      duration: { type: Number, default: null }, // seconds for voice notes
    },
    quizMetadata: {
      quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', default: null },
      title: { type: String, default: null },
      category: { type: String, default: null },
      questionCount: { type: Number, default: 0 },
      difficulty: { type: String, default: null },
      challengeScore: { type: Number, default: null },
    },
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      default: null,
    },
    comment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuizComment',
      default: null,
    },
    link: {
      type: String,
      default: null,
      trim: true,
    },
    deliveryStatus: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
      index: true,
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    replyTo: {
      messageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null,
      },
      senderName: {
        type: String,
        default: '',
      },
      text: {
        type: String,
        default: '',
      },
    },
    reactions: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        emoji: {
          type: String,
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ conversation: 1, createdAt: 1 });
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;
