/**
 * Interface / Contract: IQuizRepository
 * Declares persistence operations for Quiz and Challenge entities.
 */
export class IQuizRepository {
  async findById(id) {
    throw new Error('Method not implemented: findById');
  }

  async find(filter = {}, options = {}) {
    throw new Error('Method not implemented: find');
  }

  async save(quiz) {
    throw new Error('Method not implemented: save');
  }

  async update(id, updateData) {
    throw new Error('Method not implemented: update');
  }

  async delete(id) {
    throw new Error('Method not implemented: delete');
  }

  async count(filter = {}) {
    throw new Error('Method not implemented: count');
  }
}

export default IQuizRepository;
