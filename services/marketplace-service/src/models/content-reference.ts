import mongoose from 'mongoose';

export interface ContentReference<T extends string = string> {
  type?: T | null | undefined;
  contentType?: T | null | undefined;
  contentId?: unknown;
}

export function isObjectId(value: unknown): value is string | mongoose.Types.ObjectId {
  return value instanceof mongoose.Types.ObjectId ||
    (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value));
}

export function validateContentId(value: unknown): boolean {
  if (!value) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number' || value instanceof Uint8Array) {
    return mongoose.Types.ObjectId.isValid(value);
  }
  return value instanceof mongoose.Types.ObjectId;
}

interface DocumentFields {
  get?(field: string): unknown;
  toObject?(): unknown;
}

function readField(value: unknown, field: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, field) : undefined;
}

export function assertNoDuplicatedContent(doc: DocumentFields, fields: readonly string[], context: string) {
  const raw: unknown = doc.toObject?.() ?? doc;
  for (const field of fields) {
    if (doc.get?.(field) !== undefined || readField(raw, field) !== undefined ||
        readField(doc, field) !== undefined || readField(readField(doc, '_doc'), field) !== undefined) {
      throw new Error(
        `Zero Duplication Invariant violation: storing '${field}' is strictly forbidden in marketplace ${context}`
      );
    }
  }
}

export interface LegacyQuizQuery {
  getQuery?(): Record<string, unknown>;
}

export function normalizeLegacyQuizQuery(query: LegacyQuizQuery, contentTypeFilter: Record<string, unknown>) {
  const filter = query.getQuery?.();
  if (!filter || filter.quizId === undefined) return;

  const quizId = filter.quizId;
  delete filter.quizId;
  let contentIdQuery: unknown = quizId;
  if (isObjectId(quizId)) {
    const objectId = typeof quizId === 'string' ? new mongoose.Types.ObjectId(quizId) : quizId;
    contentIdQuery = { $in: [objectId, quizId.toString()] };
  } else if (typeof quizId === 'object' && quizId !== null && '$in' in quizId && Array.isArray(quizId.$in)) {
    const items: unknown[] = quizId.$in;
    const expanded: unknown[] = [];
    for (const item of items) {
      expanded.push(item);
      if (isObjectId(item)) {
        expanded.push(typeof item === 'string' ? new mongoose.Types.ObjectId(item) : item.toString());
      }
    }
    contentIdQuery = { $in: expanded };
  }

  const orClause = [{ quizId }, { 'contentRef.contentId': contentIdQuery, ...contentTypeFilter }];
  if (filter.$or) {
    const existingAnd: unknown[] = Array.isArray(filter.$and) ? filter.$and : [];
    filter.$and = [...existingAnd, { $or: filter.$or }, { $or: orClause }];
    delete filter.$or;
  } else {
    filter.$or = orClause;
  }
}
