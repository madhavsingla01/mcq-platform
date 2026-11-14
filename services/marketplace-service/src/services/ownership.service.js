import mongoose from 'mongoose';

/**
 * Custom error for unauthorized content ownership attempts.
 */
export class OwnershipError extends Error {
  constructor(message = 'User does not own the referenced content', code = 'FORBIDDEN_CONTENT_NOT_OWNED') {
    super(message);
    this.name = 'OwnershipError';
    this.code = code;
    this.statusCode = 403;
  }
}

/**
 * Normalizes ObjectId or string into a 24-char string representation.
 * @param {any} id
 * @returns {string}
 */
const normalizeId = (id) => {
  if (!id) return '';
  if (typeof id === 'string') return id.trim();
  if (id._id) return String(id._id);
  return String(id);
};

/**
 * Authoritatively verifies that the seller is the verified author/uploader of the quiz,
 * without exposing or leaking any private quiz questions, answer choices, or explanations.
 *
 * @param {Object} params
 * @param {Object} params.quiz - Quiz document or summary object containing at least `uploader`
 * @param {string|mongoose.Types.ObjectId} params.sellerId - Authenticated seller user ID
 * @returns {{ allowed: boolean, quizId: string, sellerId: string }} Sanitized verification result
 * @throws {OwnershipError} If ownership verification fails or content is restricted/deleted
 */
export function verifyQuizOwnership({ quiz, sellerId }) {
  if (!quiz) {
    throw new OwnershipError('Target quiz not found', 'RESOURCE_NOT_FOUND');
  }

  const normalizedSellerId = normalizeId(sellerId);
  if (!normalizedSellerId) {
    throw new OwnershipError('A valid seller ID is required for ownership verification', 'INVALID_SELLER_ID');
  }

  // Quiz author is stored in `uploader` (or `userId` in legacy formats)
  const quizUploader = normalizeId(quiz.uploader || quiz.userId);

  if (!quizUploader) {
    throw new OwnershipError('Quiz has no recorded uploader/author', 'FORBIDDEN_CONTENT_NOT_OWNED');
  }

  if (quizUploader !== normalizedSellerId) {
    throw new OwnershipError(
      'Only the verified content author can list this quiz on the marketplace',
      'FORBIDDEN_CONTENT_NOT_OWNED'
    );
  }

  if (quiz.isDeleted === true) {
    throw new OwnershipError('Cannot list a deleted quiz', 'FORBIDDEN_CONTENT_DELETED');
  }

  if (quiz.isRestricted === true) {
    throw new OwnershipError('Cannot list a restricted or suspended quiz', 'FORBIDDEN_CONTENT_RESTRICTED');
  }

  // Sanitized verification output — Zero Leakage Principle
  return {
    allowed: true,
    quizId: normalizeId(quiz._id || quiz.id),
    sellerId: normalizedSellerId,
  };
}

/**
 * Asynchronously verifies quiz ownership against a live database connection
 * using a minimal projection strictly omitting questions, answers, and media.
 *
 * @param {string|mongoose.Types.ObjectId} quizId
 * @param {string|mongoose.Types.ObjectId} sellerId
 * @param {mongoose.Connection} [connection]
 * @returns {Promise<{ allowed: boolean, quizId: string, sellerId: string }>}
 */
export async function verifyQuizOwnershipWithDb(quizId, sellerId, connection = mongoose.connection) {
  if (!quizId || !sellerId) {
    throw new OwnershipError('quizId and sellerId are both required', 'INVALID_INPUT');
  }

  const targetId = typeof quizId === 'string' ? new mongoose.Types.ObjectId(quizId) : quizId;
  const db = connection.db || (connection.readyState === 1 ? connection.client.db() : null);

  if (!db) {
    throw new Error('Database connection is not available for ownership verification');
  }

  // Strictly project out questions, answers, and media to maintain Zero Duplication & Leakage
  const quizDoc = await db.collection('quizzes').findOne(
    { _id: targetId },
    {
      projection: {
        _id: 1,
        uploader: 1,
        isDeleted: 1,
        isRestricted: 1,
      },
    }
  );

  return verifyQuizOwnership({ quiz: quizDoc, sellerId });
}

/**
 * Authoritatively verifies that the seller is the verified author/owner of the educational asset,
 * enforcing ready lifecycle status and non-deleted state.
 *
 * @param {Object} params
 * @param {Object} params.asset - Educational asset document or summary object
 * @param {string|mongoose.Types.ObjectId} params.sellerId - Authenticated seller user ID
 * @returns {{ allowed: boolean, assetId: string, sellerId: string }}
 * @throws {OwnershipError} If ownership verification fails, asset not ready, or deleted
 */
export function verifyEducationalAssetOwnership({ asset, sellerId }) {
  if (!asset) {
    throw new OwnershipError('Target educational asset not found', 'RESOURCE_NOT_FOUND');
  }

  const normalizedSellerId = normalizeId(sellerId);
  if (!normalizedSellerId) {
    throw new OwnershipError('A valid seller ID is required for ownership verification', 'INVALID_SELLER_ID');
  }

  const assetOwner = normalizeId(asset.ownerId || asset.uploader || asset.userId);
  if (!assetOwner) {
    throw new OwnershipError('Asset has no recorded owner', 'FORBIDDEN_CONTENT_NOT_OWNED');
  }

  if (assetOwner !== normalizedSellerId) {
    throw new OwnershipError(
      'Only the verified asset owner can list this resource on the marketplace',
      'FORBIDDEN_CONTENT_NOT_OWNED'
    );
  }

  if (!asset.status || asset.status !== 'ready') {
    throw new OwnershipError(
      `Cannot list asset with status '${asset.status || 'unknown'}'. Only 'ready' assets can be listed.`,
      'FORBIDDEN_ASSET_NOT_READY'
    );
  }

  if (asset.deletedAt) {
    throw new OwnershipError('Cannot list a deleted asset', 'FORBIDDEN_CONTENT_DELETED');
  }

  return {
    allowed: true,
    assetId: normalizeId(asset._id || asset.id || asset.assetId),
    sellerId: normalizedSellerId,
  };
}

/**
 * Asynchronously verifies educational asset ownership against the live database connection
 * using a minimal projection strictly omitting file paths, buffers, metadata, and preview data.
 *
 * @param {string|mongoose.Types.ObjectId} assetId
 * @param {string|mongoose.Types.ObjectId} sellerId
 * @param {mongoose.Connection|Object} [connection]
 * @returns {Promise<{ allowed: boolean, assetId: string, sellerId: string }>}
 * @throws {OwnershipError} If ownership verification fails, asset not ready, or deleted
 */
export async function verifyEducationalAssetOwnershipWithDb(
  assetId,
  sellerId,
  connection = mongoose.connection
) {
  if (!assetId || !sellerId) {
    throw new OwnershipError('assetId and sellerId are both required', 'INVALID_INPUT');
  }

  const normalizedAssetId = normalizeId(assetId);
  if (!normalizedAssetId) {
    throw new OwnershipError('Target educational asset not found', 'RESOURCE_NOT_FOUND');
  }

  const normalizedSellerId = normalizeId(sellerId);
  if (!normalizedSellerId) {
    throw new OwnershipError('A valid seller ID is required for ownership verification', 'INVALID_SELLER_ID');
  }

  const db =
    connection.db ||
    (typeof connection.collection === 'function' ? connection : null) ||
    (connection.readyState === 1 && connection.client ? connection.client.db() : null);

  if (!db) {
    throw new Error('Database connection is not available for ownership verification');
  }

  // Support both UUID string and ObjectId query for _id
  const queryFilter = mongoose.Types.ObjectId.isValid(normalizedAssetId)
    ? {
        $or: [
          { _id: normalizedAssetId },
          { _id: new mongoose.Types.ObjectId(normalizedAssetId) },
        ],
      }
    : { _id: normalizedAssetId };

  // Strictly project minimal fields (Zero Duplication & Zero Leakage)
  const assetDoc = await db.collection('mediaassets').findOne(queryFilter, {
    projection: {
      _id: 1,
      ownerId: 1,
      status: 1,
      deletedAt: 1,
    },
  });

  return verifyEducationalAssetOwnership({ asset: assetDoc, sellerId: normalizedSellerId });
}

export default {
  verifyQuizOwnership,
  verifyQuizOwnershipWithDb,
  verifyEducationalAssetOwnership,
  verifyEducationalAssetOwnershipWithDb,
  OwnershipError,
};
