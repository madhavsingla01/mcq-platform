/**
 * Interface / Contract: IQuestionRepository
 * Declares persistence operations for Question banks.
 */
export class IQuestionRepository {
  async findByQuizId(quizId, { sorted = true } = {}) {
    throw new Error('Method not implemented: findByQuizId');
  }

  async saveMany(questions) {
    throw new Error('Method not implemented: saveMany');
  }

  async deleteByQuizId(quizId) {
    throw new Error('Method not implemented: deleteByQuizId');
  }
}

export default IQuestionRepository;
