import { catchAsync } from '../middleware/error.middleware.js';

export const getDiscussions = catchAsync(async (req, res) => {
  res.json({ success: true, data: { discussions: [] }, message: 'Community features coming soon' });
});
export const createDiscussion = catchAsync(async (req, res) => {
  res.json({ success: true, message: 'Community features coming soon' });
});
