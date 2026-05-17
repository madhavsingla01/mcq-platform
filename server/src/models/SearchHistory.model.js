import mongoose from 'mongoose';

const searchHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    clientSessionId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    query: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    context: {
      type: String,
      default: 'quiz_search',
      trim: true,
      index: true,
    },
    filters: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    resultCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

searchHistorySchema.index({ userId: 1, createdAt: -1 });
searchHistorySchema.index({ clientSessionId: 1, createdAt: -1 });
searchHistorySchema.index({ query: 'text' });

const SearchHistory = mongoose.model('SearchHistory', searchHistorySchema);

export default SearchHistory;
