import AttemptModel from '../../models/Attempt.model.js';
import { IAttemptRepository } from '../../domain/repositories/IAttemptRepository.js';

export class MongooseAttemptRepository extends IAttemptRepository {
  async findById(id) {
    return AttemptModel.findById(id);
  }

  async findActiveAttempt({ quizId, userId = null, sessionId = null }) {
    const query = {
      quizId,
      status: 'in_progress',
    };

    if (userId) {
      query.userId = userId;
    } else if (sessionId) {
      query.sessionId = sessionId;
    } else {
      return null;
    }

    return AttemptModel.findOne(query).sort({ createdAt: -1 });
  }

  async findPriorAttempt({ quizId, userId = null, sessionId = null }) {
    const query = {
      quizId,
      status: { $in: ['completed', 'abandoned'] },
    };

    if (userId) {
      query.userId = userId;
    } else if (sessionId) {
      query.sessionId = sessionId;
    } else {
      return null;
    }

    return AttemptModel.findOne(query);
  }

  async findCompletedByQuizId(quizId, { limit = 100 } = {}) {
    return AttemptModel.find({
      quizId,
      status: 'completed',
      isPractice: { $ne: true },
    })
      .select('userId score totalMarks totalTime totalTimeMs percentage completedAt updatedAt isPractice')
      .sort({ score: -1, totalTimeMs: 1, completedAt: 1 })
      .limit(limit)
      .populate('userId', 'name username avatar')
      .lean();
  }

  async countAttempts(filter = {}) {
    return AttemptModel.countDocuments(filter);
  }

  async save(attemptData) {
    if (attemptData._id || attemptData.id) {
      const id = attemptData._id || attemptData.id;
      return AttemptModel.findByIdAndUpdate(id, attemptData, { new: true });
    }
    const doc = new AttemptModel(attemptData);
    return doc.save();
  }

  async update(id, updateData) {
    return AttemptModel.findByIdAndUpdate(id, updateData, { new: true });
  }

  async deleteMany(filter = {}) {
    return AttemptModel.deleteMany(filter);
  }
}

export default MongooseAttemptRepository;
