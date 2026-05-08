import { Router } from 'express';
import { register, login, logout, refresh, getMe } from '../controllers/auth.controller.js';
import { optionalAuth, protect } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { authRateLimit } from '../middleware/rateLimit.middleware.js';

const router = Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

router.post('/register', authRateLimit, validateBody({
  name: { required: true, type: 'string', min: 2, max: 50 },
  email: { required: true, type: 'string', email: true },
  password: { required: true, type: 'string', min: 6 },
}), register);

router.post('/login', authRateLimit, validateBody({
  email: { required: true, type: 'string', email: true },
  password: { required: true, type: 'string' },
}), login);

router.post('/logout', optionalAuth, logout);
router.post('/refresh', refresh);
router.get('/me', protect, getMe);

export default router;
