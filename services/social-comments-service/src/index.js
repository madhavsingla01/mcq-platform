import { createSocialServiceApp, startSocialService } from '../../social-service/src/serviceApp.js';
import socialRoutes from './routes/social.routes.js';

const app = createSocialServiceApp('social-comments-service', socialRoutes);
startSocialService(app, 'social-comments-service');

export default app;