import QuestionModel from '../../models/Question.model.js';
import { IQuestionRepository } from '../../domain/repositories/IQuestionRepository.js';

export class MongooseQuestionRepository extends IQuestionRepository {
  async findByQuizId(quizId, { sorted = true } = {}) {
    let query = QuestionModel.find({ quizId });
    if (sorted) {
      query = query.sort({ orderIndex: 1, questionNumber: 1 });
    }
    return query.exec();
  }

  async saveMany(questions) {
    return QuestionModel.insertMany(questions);
  }

  async deleteByQuizId(quizId) {
    return QuestionModel.deleteMany({ quizId });
  }
}

export default MongooseQuestionRepository;
