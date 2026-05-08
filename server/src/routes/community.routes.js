import { Router } from 'express';
import { getDiscussions, createDiscussion } from '../controllers/community.controller.js';

const router = Router();
router.get('/:questionId', getDiscussions);
router.post('/:questionId', createDiscussion);

export default router;
