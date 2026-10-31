import QuizModel from '../../models/Quiz.model.js';
import { IQuizRepository } from '../../domain/repositories/IQuizRepository.js';

export class MongooseQuizRepository extends IQuizRepository {
  async findById(id) {
    return QuizModel.findById(id);
  }

  async find(filter = {}, options = {}) {
    let query = QuizModel.find(filter);
    if (options.sort) query = query.sort(options.sort);
    if (options.skip) query = query.skip(options.skip);
    if (options.limit) query = query.limit(options.limit);
    if (options.select) query = query.select(options.select);
    if (options.populate) query = query.populate(options.populate);
    if (options.lean) query = query.lean();
    return query.exec();
  }

  async save(quizData) {
    if (quizData._id || quizData.id) {
      const id = quizData._id || quizData.id;
      return QuizModel.findByIdAndUpdate(id, quizData, { new: true, runValidators: true });
    }
    const doc = new QuizModel(quizData);
    return doc.save();
  }

  async update(id, updateData) {
    return QuizModel.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
  }

  async delete(id) {
    return QuizModel.findByIdAndDelete(id);
  }

  async count(filter = {}) {
    return QuizModel.countDocuments(filter);
  }
}

export default MongooseQuizRepository;
