/**
 * User model with password hashing and JWT support.
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name must be at most 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email'],
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9_.]+$/, 'Username can only contain lowercase letters, numbers, underscores, and dots'],
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username must be at most 30 characters'],
    },
    userCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // Don't include password in queries by default
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    refreshToken: {
      type: String,
      select: false,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    sessions: {
      type: [{
        sessionId: { type: String, required: true },
        device: { type: String, required: true, maxlength: 120 },
        createdAt: { type: Date, required: true },
        lastActiveAt: { type: Date, required: true },
        expiresAt: { type: Date, required: true },
      }],
      default: [],
      select: false,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    // Personal profile fields
    phone: { type: String },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'] },
    address: {
      street: String,
      city: String,
      region: String,
      postalCode: String,
      country: String,
    },
    bio: { type: String, maxlength: 2000 },
    socialLinks: {
      type: [{
        platform: {
          type: String,
          trim: true,
          maxlength: 40,
        },
        url: {
          type: String,
          trim: true,
          maxlength: 500,
        },
      }],
      default: [],
    },
    age: { type: Number, min: 0 },
    preferences: {
      type: mongoose.Schema.Types.Mixed,
      default: {
        theme: 'dark',
        fontSize: 'md',
        density: 'comfortable',
        timerVisibility: 'visible',
        showCorrectAnswerInstantly: false,
        reducedMotion: false,
        focusMode: false,
        quizTimer: false,
        shuffleQuestions: false,
        keyboardShortcutsEnabled: true,
        panelWidths: {
          navigator: 20,
          workspace: 55,
        },
      },
    },
    avatar: String,
    banner: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isProfilePublic: { type: Boolean, default: true, index: true },
    isPrivate: { type: Boolean, default: false, index: true },
    quizCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    followersCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    followingCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    activityCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

userSchema.index({ username: 1, isProfilePublic: 1 });
userSchema.index({ isProfilePublic: 1, followersCount: -1, quizCount: -1, createdAt: -1 });
userSchema.index({ isProfilePublic: 1, quizCount: -1, followersCount: -1 });
userSchema.index({ isProfilePublic: 1, createdAt: -1 });
userSchema.index({ isProfilePublic: 1, name: 1 });

// Pre-save synchronization for privacy status
userSchema.pre('save', function (next) {
  if (this.isModified('isPrivate')) {
    this.isProfilePublic = !this.isPrivate;
  } else if (this.isModified('isProfilePublic')) {
    this.isPrivate = !this.isProfilePublic;
  }
  next();
});

// Ensure permanent userCode exists
userSchema.pre('save', async function (next) {
  if (!this.userCode) {
    let code;
    let exists = true;
    let attempts = 0;
    while (exists && attempts < 10) {
      code = 'USR-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      exists = await mongoose.models.User.findOne({ userCode: code });
      attempts++;
    }
    this.userCode = code || ('USR-' + Date.now().toString(36).toUpperCase());
  }
  next();
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password instance method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if account is locked due to too many failed attempts
userSchema.methods.isLocked = function () {
  return Boolean(this.lockUntil && this.lockUntil > Date.now());
};

// Increment failed attempts and trigger lockout if limit reached
userSchema.methods.incrementLoginAttempts = async function () {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    this.failedLoginAttempts = 1;
    this.lockUntil = null;
    return this.save({ validateBeforeSave: false });
  }
  this.failedLoginAttempts = (this.failedLoginAttempts || 0) + 1;
  if (this.failedLoginAttempts >= 5) {
    this.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes lockout
  }
  return this.save({ validateBeforeSave: false });
};

// Reset failed attempts on successful login
userSchema.methods.resetLoginAttempts = async function () {
  if (this.failedLoginAttempts > 0 || this.lockUntil) {
    this.failedLoginAttempts = 0;
    this.lockUntil = null;
    return this.save({ validateBeforeSave: false });
  }
};

// Remove sensitive fields from JSON
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshToken;
  delete obj.__v;
  return obj;
};

const User = mongoose.model('User', userSchema);
export default User;
