import mongoose from 'mongoose';

const quizCommentSchema = new mongoose.Schema(
  {
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      required: true,
      index: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuizComment',
      default: null,
      index: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ['active', 'deleted'],
      default: 'active',
      index: true,
    },
    editedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

quizCommentSchema.index({ quiz: 1, status: 1, createdAt: -1 });
quizCommentSchema.index({ author: 1, createdAt: -1 });

const QuizComment = mongoose.model('QuizComment', quizCommentSchema);
export default QuizComment;
