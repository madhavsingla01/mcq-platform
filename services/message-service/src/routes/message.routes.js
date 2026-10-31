import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { validateObjectId } from '../middleware/validation.middleware.js';
import {
  getConversations,
  startConversation,
  getMessages,
  sendMessage,
  markConversationRead,
  getUnreadMessagesCount,
  searchMessageUsers,
  editMessage,
  deleteMessage,
  toggleMessageReaction,
} from '../controllers/message.controller.js';

const router = express.Router();

router.use(protect);

router.get('/conversations', getConversations);
router.post('/start', startConversation);
router.get('/unread-count', getUnreadMessagesCount);
router.get('/search-users', searchMessageUsers);

router.get('/conversations/:conversationId', validateObjectId('conversationId'), getMessages);
router.post('/conversations/:conversationId/messages', validateObjectId('conversationId'), sendMessage);
router.patch('/conversations/:conversationId/read', validateObjectId('conversationId'), markConversationRead);

// WhatsApp message interaction routes
router.patch('/:messageId', validateObjectId('messageId'), editMessage);
router.delete('/:messageId', validateObjectId('messageId'), deleteMessage);
router.post('/:messageId/reactions', validateObjectId('messageId'), toggleMessageReaction);

export default router;
