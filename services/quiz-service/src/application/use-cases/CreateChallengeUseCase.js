import { Challenge } from '../../domain/entities/Challenge.js';

export class CreateChallengeUseCase {
  constructor({ quizRepository, questionRepository }) {
    this.quizRepository = quizRepository;
    this.questionRepository = questionRepository;
  }

  async execute(challengeData) {
    const challenge = new Challenge({
      title: challengeData.title,
      description: challengeData.description,
      uploaderId: challengeData.uploaderId,
      questions: challengeData.questions || [],
      durationMinutes: challengeData.durationMinutes,
      deadlineAt: challengeData.deadlineAt,
      accessType: challengeData.accessType || 'public',
      inviteAccessType: challengeData.inviteAccessType || null,
      challengeStatus: 'active',
      settings: challengeData.settings || {},
    });

    // Enforce domain invariants
    challenge.validate();

    // Persist via repositories
    const savedQuiz = await this.quizRepository.save({
      title: challenge.title,
      description: challenge.description,
      uploader: challenge.uploaderId,
      questionCount: challenge.questions.length,
      totalMarks: challenge.questions.length,
      isChallenge: true,
      deadlineAt: challenge.deadlineAt,
      durationMinutes: challenge.durationMinutes,
      accessType: challenge.accessType,
      inviteAccessType: challenge.inviteAccessType,
      challengeStatus: challenge.challengeStatus,
      visibility: challenge.accessType === 'public' ? 'public' : 'private',
      isPublic: challenge.accessType === 'public',
      settings: {
        timeLimit: challenge.durationMinutes,
        timerMode: 'strict',
        ...challenge.settings,
      },
      tags: challengeData.tags || [],
    });

    if (challenge.questions.length > 0) {
      const questionRecords = challenge.questions.map((q, index) => ({
        ...q,
        quizId: savedQuiz._id || savedQuiz.id,
        questionNumber: q.questionNumber || index + 1,
        orderIndex: index,
        marks: 1,
      }));
      await this.questionRepository.saveMany(questionRecords);
    }

    return savedQuiz;
  }
}

export default CreateChallengeUseCase;
