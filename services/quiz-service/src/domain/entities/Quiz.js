/**
 * Quiz Entity (Pure OOP Domain Entity)
 * Represents standard open-ended, untimed or timed self-paced quizzes.
 */
export class Quiz {
  constructor({
    id = null,
    title,
    category = 'General',
    difficulty = 'All Levels',
    description = '',
    thumbnail = '',
    visibility = 'private',
    uploaderId = null,
    questionCount = 0,
    totalMarks = 0,
    settings = {},
    tags = [],
    isChallenge = false,
    createdAt = new Date(),
    updatedAt = new Date(),
  }) {
    this.id = id;
    this.title = title;
    this.category = category;
    this.difficulty = difficulty;
    this.description = description;
    this.thumbnail = thumbnail;
    this.visibility = visibility;
    this.uploaderId = uploaderId ? String(uploaderId) : null;
    this.questionCount = questionCount;
    this.totalMarks = totalMarks;
    this.settings = settings || {};
    this.tags = tags || [];
    this.isChallenge = isChallenge;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  validate() {
    if (!this.title || String(this.title).trim() === '') {
      throw new Error('Quiz title is required');
    }
    return true;
  }

  isPublic() {
    return this.visibility === 'public';
  }

  isOwner(userId) {
    if (!this.uploaderId || !userId) return false;
    return String(this.uploaderId) === String(userId);
  }
}

export default Quiz;
