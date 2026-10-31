import { MongooseQuizRepository } from '../repositories/MongooseQuizRepository.js';
import { MongooseAttemptRepository } from '../repositories/MongooseAttemptRepository.js';
import { MongooseQuestionRepository } from '../repositories/MongooseQuestionRepository.js';

/**
 * Lightweight Dependency Injection Container
 * Manages service instances, decoupling controllers from database implementations.
 */
class DIContainer {
  constructor() {
    this.services = new Map();
    this.registerDefaults();
  }

  registerDefaults() {
    this.registerSingleton('quizRepository', () => new MongooseQuizRepository());
    this.registerSingleton('attemptRepository', () => new MongooseAttemptRepository());
    this.registerSingleton('questionRepository', () => new MongooseQuestionRepository());
  }

  registerSingleton(name, factory) {
    this.services.set(name, { factory, instance: null, isSingleton: true });
  }

  registerTransient(name, factory) {
    this.services.set(name, { factory, instance: null, isSingleton: false });
  }

  resolve(name) {
    const registration = this.services.get(name);
    if (!registration) {
      throw new Error(`Service not registered in DI container: ${name}`);
    }

    if (registration.isSingleton) {
      if (!registration.instance) {
        registration.instance = registration.factory(this);
      }
      return registration.instance;
    }

    return registration.factory(this);
  }

  /**
   * Override a registration (primarily for testing with mocks)
   */
  override(name, mockInstance) {
    this.services.set(name, {
      factory: () => mockInstance,
      instance: mockInstance,
      isSingleton: true,
    });
  }

  reset() {
    this.services.clear();
    this.registerDefaults();
  }
}

export const container = new DIContainer();
export default container;
