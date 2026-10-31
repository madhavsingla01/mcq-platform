import { AppError } from "../middleware/error.middleware.js";

export const assertUploadAccess = (upload, req) => {
  if (upload.userId) {
    if (!req.user) throw new AppError("Authentication is required to access this upload", 401);
    if (String(upload.userId) !== String(req.user._id)) {
      throw new AppError("Not authorized to access this upload", 403);
    }
    return;
  }

  const sessionId = req.get("x-client-session-id") || req.get("x-quiz-session-id") || req.body?.sessionId || req.query?.sessionId;
  if (!upload.guestSessionId || !sessionId || upload.guestSessionId !== sessionId) {
    throw new AppError("Not authorized to access this guest upload", 403);
  }
};
