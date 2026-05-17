import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  return res.json({
    success: true,
    message: 'Chat API working',
  });
});

export default router;
