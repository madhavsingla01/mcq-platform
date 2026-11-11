import { Router } from 'express';
import {
  register,
  login,
  logout,
  refresh,
  getMe,
  updateMe,
  uploadUserAvatar,
  uploadUserBanner,
  removeUserBanner,
  deleteAccount,
  checkUsername,
  searchUsers,
  bootstrapSession,
  getSessions,
  revokeSession,
  revokeOtherSessions,
} from '../controllers/auth.controller.js';
import { optionalAuth, protect } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { authAddressLimit, authRateLimit } from '../middleware/rateLimit.middleware.js';

const router = Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

router.get('/check-username', optionalAuth, checkUsername);
router.get('/users/search', optionalAuth, searchUsers);
router.get('/bootstrap', bootstrapSession);

router.post('/register', authAddressLimit, authRateLimit, validateBody({
  name: { required: true, type: 'string', min: 2, max: 50 },
  email: { required: true, type: 'string', email: true },
  password: { required: true, type: 'string', min: 6 },
}), register);

router.post('/login', authAddressLimit, authRateLimit, validateBody({
  email: { type: 'string', max: 320 },
  identifier: { type: 'string', max: 320 },
  password: { required: true, type: 'string', max: 1024 },
}), login);

router.post('/logout', optionalAuth, logout);
router.post('/refresh', authRateLimit, refresh);
router.get('/me', protect, getMe);
router.get('/me/sessions', protect, getSessions);
router.post('/me/sessions/:sessionId/revoke', protect, authRateLimit, validateBody({
  currentPassword: { required: true, type: 'string', max: 1024 },
}), revokeSession);
router.post('/me/sessions/revoke', protect, authRateLimit, validateBody({
  currentPassword: { required: true, type: 'string', max: 1024 },
}), revokeOtherSessions);
router.post('/me/avatar', protect, uploadUserAvatar);
router.post('/me/banner', protect, uploadUserBanner);
router.delete('/me/banner', protect, removeUserBanner);
router.patch('/me', protect, validateBody({
  name: { required: false, type: 'string', min: 2, max: 50 },
  username: { required: false, type: 'string', min: 3, max: 30 },
  email: { required: false, type: 'string', email: true },
  avatar: { required: false, type: 'string' },
  banner: { required: false, type: 'string' },
  currentPassword: { required: false, type: 'string' },
  oldPassword: { required: false, type: 'string' },
  password: { required: false, type: 'string', min: 6 },
  confirmPassword: { required: false, type: 'string', min: 6 },
  phone: { required: false, type: 'string' },
  dateOfBirth: { required: false, type: 'string' },
  gender: { required: false, type: 'string' },
  age: { required: false, type: 'number' },
  address: { required: false, type: 'object' },
  bio: { required: false, type: 'string' },
  isProfilePublic: { required: false, type: 'boolean' },
  isPrivate: { required: false, type: 'boolean' },
  socialLinks: { required: false },
  preferences: { required: false },
}), updateMe);

router.put('/me', protect, validateBody({
  name: { required: false, type: 'string', min: 2, max: 50 },
  username: { required: false, type: 'string', min: 3, max: 30 },
  email: { required: false, type: 'string', email: true },
  avatar: { required: false, type: 'string' },
  banner: { required: false, type: 'string' },
  currentPassword: { required: false, type: 'string' },
  oldPassword: { required: false, type: 'string' },
  password: { required: false, type: 'string', min: 6 },
  confirmPassword: { required: false, type: 'string', min: 6 },
  phone: { required: false, type: 'string' },
  dateOfBirth: { required: false, type: 'string' },
  gender: { required: false, type: 'string' },
  age: { required: false, type: 'number' },
  address: { required: false, type: 'object' },
  bio: { required: false, type: 'string' },
  isProfilePublic: { required: false, type: 'boolean' },
  isPrivate: { required: false, type: 'boolean' },
  socialLinks: { required: false },
  preferences: { required: false },
}), updateMe);

router.delete('/me', protect, deleteAccount);

export default router;
