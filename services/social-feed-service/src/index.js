import { createSocialServiceApp, startSocialService } from '../../social-service/src/serviceApp.js';
import socialRoutes from './routes/social.routes.js';

const app = createSocialServiceApp('social-feed-service', socialRoutes);
startSocialService(app, 'social-feed-service');

export default app;