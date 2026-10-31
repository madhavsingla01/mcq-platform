import mongoose from 'mongoose';

const quizShareSchema = new mongoose.Schema(
  {
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    channel: {
      type: String,
      trim: true,
      maxlength: 40,
      default: 'copy_link',
    },
    clientSessionId: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

quizShareSchema.index({ quiz: 1, createdAt: -1 });
quizShareSchema.index({ user: 1, createdAt: -1 });

const QuizShare = mongoose.model('QuizShare', quizShareSchema);
export default QuizShare;
