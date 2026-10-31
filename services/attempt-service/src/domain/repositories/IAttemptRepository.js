/**
 * Interface / Contract: IAttemptRepository
 * Declares persistence operations for Quiz and Challenge attempts.
 */
export class IAttemptRepository {
  async findById(id) {
    throw new Error('Method not implemented: findById');
  }

  async findActiveAttempt({ quizId, userId = null, sessionId = null }) {
    throw new Error('Method not implemented: findActiveAttempt');
  }

  async findPriorAttempt({ quizId, userId = null, sessionId = null }) {
    throw new Error('Method not implemented: findPriorAttempt');
  }

  async findCompletedByQuizId(quizId, { limit = 100 } = {}) {
    throw new Error('Method not implemented: findCompletedByQuizId');
  }

  async countAttempts(filter = {}) {
    throw new Error('Method not implemented: countAttempts');
  }

  async save(attempt) {
    throw new Error('Method not implemented: save');
  }

  async update(id, updateData) {
    throw new Error('Method not implemented: update');
  }

  async deleteMany(filter = {}) {
    throw new Error('Method not implemented: deleteMany');
  }
}

export default IAttemptRepository;
