import mongoose from 'mongoose';

const quizInteractionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['like', 'bookmark'],
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

quizInteractionSchema.index({ user: 1, quiz: 1, type: 1 }, { unique: true });
quizInteractionSchema.index({ quiz: 1, type: 1, createdAt: -1 });
quizInteractionSchema.index({ user: 1, type: 1, createdAt: -1 });

const QuizInteraction = mongoose.model('QuizInteraction', quizInteractionSchema);
export default QuizInteraction;
