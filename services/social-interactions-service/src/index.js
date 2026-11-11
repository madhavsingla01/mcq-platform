import { createSocialServiceApp, startSocialService } from '../../social-service/src/serviceApp.js';
import socialRoutes from './routes/social.routes.js';

const app = createSocialServiceApp('social-interactions-service', socialRoutes);
startSocialService(app, 'social-interactions-service');

export default app;