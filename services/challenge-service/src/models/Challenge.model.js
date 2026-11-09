import mongoose from 'mongoose';
import { randomInt } from 'crypto';

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const generateChallengeCode = () => {
  let code = '!QZ-';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length));
  }
  return code;
};

const challengeQuestionSchema = new mongoose.Schema(
  {
    accessibilityMedia: { type: [mongoose.Schema.Types.Mixed], default: [] },
    questionText: { type: String, required: function () { return !this.accessibilityMedia?.length; }, trim: true },
    questionType: { type: String, enum: ['multiple_choice', 'dropdown', 'checkboxes', 'short_answer'], default: 'multiple_choice' },
    options: {
      type: [mongoose.Schema.Types.Mixed],
      required: true,
      validate: [
        function validateOptions(val) { return this.questionType === 'short_answer' ? val.length === 0 : val.length >= 2; },
        'Each challenge question requires at least 2 options.',
      ],
    },
    correctOption: { type: Number, required: function requireCorrectOption() { return !['checkboxes', 'short_answer'].includes(this.questionType); }, min: 0 },
    correctAnswer: { type: mongoose.Schema.Types.Mixed },
    explanation: { type: String, default: '', trim: true },
    marks: { type: Number, default: 1, min: 0 },
    imageUrl: { type: String, default: null, trim: true },
  },
  { _id: true }
);

const challengeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Challenge title is required'],
      trim: true,
      minlength: [3, 'Challenge title must be at least 3 characters'],
      maxlength: [120, 'Challenge title cannot exceed 120 characters'],
      index: true,
    },
    challengeCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    // Also mirror to quizCode for cross-service reverse resolution
    quizCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
      default: '',
    },
    category: {
      type: String,
      trim: true,
      default: 'General',
      index: true,
    },
    difficulty: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced', 'All Levels'],
      default: 'Intermediate',
      index: true,
    },
    thumbnail: {
      type: String,
      trim: true,
      default: null,
    },
    uploader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    isChallenge: {
      type: Boolean,
      default: true,
      index: true,
    },
    durationMinutes: {
      type: Number,
      required: function requireDuration() { return this.challengeStatus !== 'draft'; },
      min: [1, 'Duration must be at least 1 minute'],
      max: [180, 'Duration cannot exceed 180 minutes'],
    },
    deadlineAt: {
      type: Date,
      required: function requireDeadline() { return this.challengeStatus !== 'draft'; },
      index: true,
    },
    draftData: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
      select: false,
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: undefined },
    accessType: {
      type: String,
      enum: ['public', 'invite_only'],
      default: 'public',
      index: true,
    },
    inviteAccessType: {
      type: String,
      enum: ['invitation', 'approval', null],
      default: null,
    },
    challengeStatus: {
      type: String,
      enum: ['draft', 'publishing', 'active', 'ended'],
      default: 'active',
      index: true,
    },
    visibility: {
      type: String,
      enum: ['public', 'private', 'unlisted'],
      default: 'public',
      index: true,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    // Max 10 Questions Constraint
    questions: {
      type: [challengeQuestionSchema],
      default: [],
      validate: [
        (val) => val.length <= 10,
        'Competitive challenges are restricted to a maximum of 10 questions.',
      ],
    },
    totalQuestions: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },
    questionCount: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },
    totalMarks: {
      type: Number,
      default: 0,
    },
    tags: [{
      type: String,
      trim: true,
      index: true,
    }],
    totalAttempts: {
      type: Number,
      default: 0,
    },
    avgScore: {
      type: Number,
      default: 0,
    },
    likeCount: {
      type: Number,
      default: 0,
    },
    commentCount: {
      type: Number,
      default: 0,
    },
    bookmarkCount: {
      type: Number,
      default: 0,
    },
    settings: {
      timeLimit: { type: Number, default: 0 },
      timerMode: { type: String, enum: ['none', 'soft', 'strict'], default: 'strict' },
      instantFeedback: { type: Boolean, default: false },
      shuffleQuestions: { type: Boolean, default: false },
      shuffleOptions: { type: Boolean, default: false },
      showExplanation: { type: Boolean, default: true },
      allowReview: { type: Boolean, default: false },
    },
    isRestricted: {
      type: Boolean,
      default: false,
      index: true,
    },
    restrictedReason: {
      type: String,
      default: null,
    },
    restrictedAt: {
      type: Date,
      default: null,
    },
    restrictedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    collection: 'quizzes', // Target existing collection for 100% interoperability
    timestamps: true,
  }
);

// Indexes for high-speed contest querying
challengeSchema.index({ isChallenge: 1, challengeStatus: 1, deadlineAt: 1 });
challengeSchema.index({ isChallenge: 1, visibility: 1, isRestricted: 1 });

challengeSchema.pre('validate', function (next) {
  this.isChallenge = true;
  this.totalQuestions = Array.isArray(this.questions) ? this.questions.length : (this.questionCount || 0);
  this.questionCount = this.totalQuestions;
  if (!this.settings) this.settings = {};
  this.settings.timerMode = 'strict';
  this.settings.timeLimit = this.durationMinutes;
  this.settings.instantFeedback = false;
  this.settings.allowReview = false;

  if (!this.challengeCode) {
    this.challengeCode = generateChallengeCode();
  }
  if (!this.quizCode) {
    this.quizCode = this.challengeCode;
  }
  next();
});

const Challenge = mongoose.model('Challenge', challengeSchema);
export default Challenge;
