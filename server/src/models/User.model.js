/**
 * User model with password hashing and JWT support.
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

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
      theme: { type: String, default: 'dark' },
      // UI preferences
      fontSize: { type: String, enum: ['sm', 'md', 'lg'], default: 'md' },
      density: { type: String, enum: ['comfortable', 'compact'], default: 'comfortable' },
      timerVisibility: { type: String, enum: ['visible', 'hidden'], default: 'visible' },
      showCorrectAnswerInstantly: { type: Boolean, default: false },
      reducedMotion: { type: Boolean, default: false },
      focusMode: { type: Boolean, default: false },
      // Misc
      quizTimer: { type: Boolean, default: false },
      shuffleQuestions: { type: Boolean, default: false },
      keyboardShortcutsEnabled: { type: Boolean, default: true },
      panelWidths: {
        navigator: { type: Number, default: 20 },
        workspace: { type: Number, default: 55 },
      },
    },
    avatar: String,
    isActive: {
      type: Boolean,
      default: true,
    },
    isProfilePublic: { type: Boolean, default: true },
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
userSchema.index({ isProfilePublic: 1, followersCount: -1 });

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
