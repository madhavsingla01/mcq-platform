/**
 * QuizFocus Social & Community Service
 * Manages feed, explore discovery, reactions (likes/upvotes), bookmarks, comments, shares, and activity.
 */

import socialRoutes from './routes/social.routes.js';
import { createSocialServiceApp, startSocialService } from './serviceApp.js';

const app = createSocialServiceApp('social-service', socialRoutes);
startSocialService(app, 'social-service');

export default app;
