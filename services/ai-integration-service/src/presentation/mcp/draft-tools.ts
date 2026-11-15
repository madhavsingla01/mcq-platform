import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  createDraft, draftDetail, draftId, draftPage, draftQuestion, draftSummary, draftValidation,
  draftKind, idempotencyKey, publishedQuiz, publishedQuizPage,
} from '../../application/draft-contracts.js';
import { DraftRateLimitError, type DraftBudget } from '../../application/draft-rate-limit.js';
import type { DraftContext } from '../../application/ports/draft-core.js';
import type { ManageDrafts } from '../../application/use-cases/manage-drafts.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { Logger } from '../../shared/logging/logger.js';
import { READ_SCOPE, WRITE_SCOPE } from '../../infrastructure/auth/mcp-oauth.js';

export const mcpWriteTools = new Set(['create_quiz_draft', 'create_challenge_draft', 'add_questions']);
const oauthMeta = (scope: string) => ({ securitySchemes: [{ type: 'oauth2', scopes: [scope] }] });

const paging = {
  page: z.int().min(1).max(9999).optional(),
  limit: z.int().min(1).max(100).optional(),
};
const read = { readOnlyHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const key = idempotencyKey.describe('Reuse the same key only when retrying this exact operation.');

const toolError = z.strictObject({
  code: z.string(), message: z.string(), retryAfter: z.int().positive().optional(),
});

function toolOutput<T extends z.ZodType>(data: T) {
  return z.strictObject({
    result: z.discriminatedUnion('ok', [
      z.strictObject({ ok: z.literal(true), data }),
      z.strictObject({ ok: z.literal(false), error: toolError, requestId: z.string() }),
    ]),
  });
}

function content(data: Record<string, unknown>, isError = false): CallToolResult {
  return { structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }], ...(isError ? { isError } : {}) };
}

export function createDraftToolServer(
  drafts: ManageDrafts, context: DraftContext, budget: DraftBudget, logger: Logger,
) {
  const server = new McpServer({ name: 'quizfocus', version: '1.0.0' });

  async function run(mode: 'read' | 'write', execute: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
    try {
      if (context.scopes && !context.scopes.has(mode === 'read' ? READ_SCOPE : WRITE_SCOPE)) {
        throw new AppError('The connected account did not grant this permission', 403, 'INSUFFICIENT_SCOPE');
      }
      budget[mode](context.userId);
      return content({ result: { ok: true, data: await execute() } });
    } catch (error) {
      const publicError = error instanceof AppError ? error : new AppError('Internal service error', 500, 'INTERNAL_ERROR');
      if (publicError.statusCode >= 500) {
        logger.error('mcp.tool_failed', { requestId: context.requestId, code: publicError.code });
      }
      return content({
        result: {
          ok: false,
          error: {
            code: publicError.code, message: publicError.message,
            ...(error instanceof DraftRateLimitError ? { retryAfter: error.retryAfter } : {}),
          },
          requestId: context.requestId,
        },
      }, true);
    }
  }

  server.registerTool('create_quiz_draft', {
    description: 'Create a private, unpublished quiz draft in your account.',
    inputSchema: createDraft.options[0].omit({ kind: true }).extend({ idempotencyKey: key }),
    outputSchema: toolOutput(draftSummary),
    annotations: write, ...(context.scopes ? { _meta: oauthMeta(WRITE_SCOPE) } : {}),
  }, ({ idempotencyKey: requestKey, ...input }) =>
    run('write', () => drafts.create(context, requestKey, { ...input, kind: 'quiz' })));

  server.registerTool('create_challenge_draft', {
    description: 'Create a private, unpublished challenge draft in your account.',
    inputSchema: createDraft.options[1].omit({ kind: true }).extend({ idempotencyKey: key }),
    outputSchema: toolOutput(draftSummary),
    annotations: write, ...(context.scopes ? { _meta: oauthMeta(WRITE_SCOPE) } : {}),
  }, ({ idempotencyKey: requestKey, ...input }) =>
    run('write', () => drafts.create(context, requestKey, { ...input, kind: 'challenge' })));

  server.registerTool('list_quizzes', {
    description: 'List published quizzes you own. Drafts and competitions have their own workflow.',
    inputSchema: z.strictObject(paging),
    outputSchema: toolOutput(publishedQuizPage),
    annotations: read, ...(context.scopes ? { _meta: oauthMeta(READ_SCOPE) } : {}),
  }, ({ page, limit }) => run('read', () => drafts.listQuizzes(context, page, limit)));

  server.registerTool('get_quiz', {
    description: 'Get the metadata of a published quiz you own.',
    inputSchema: z.strictObject({ id: draftId }),
    outputSchema: toolOutput(publishedQuiz),
    annotations: read, ...(context.scopes ? { _meta: oauthMeta(READ_SCOPE) } : {}),
  }, ({ id }) => run('read', () => drafts.getQuiz(context, id)));

  server.registerTool('list_drafts', {
    description: 'List your own quiz and challenge drafts.',
    inputSchema: z.strictObject({ ...paging, kind: draftKind.optional(), search: z.string().trim().max(100).optional() }),
    outputSchema: toolOutput(draftPage),
    annotations: read, ...(context.scopes ? { _meta: oauthMeta(READ_SCOPE) } : {}),
  }, (query) => run('read', () => drafts.list(context, query)));

  server.registerTool('get_draft', {
    description: 'Retrieve an owned draft with its questions and authoring data, including expected answers.',
    inputSchema: z.strictObject({ id: draftId }),
    outputSchema: toolOutput(draftDetail),
    annotations: read, ...(context.scopes ? { _meta: oauthMeta(READ_SCOPE) } : {}),
  }, ({ id }) => run('read', () => drafts.get(context, id)));

  server.registerTool('add_questions', {
    description: 'Append 1 to 10 questions to an owned quiz or challenge draft while preserving existing questions.',
    inputSchema: z.strictObject({ id: draftId, questions: z.array(draftQuestion).min(1).max(10), idempotencyKey: key }),
    outputSchema: toolOutput(draftSummary),
    annotations: write, ...(context.scopes ? { _meta: oauthMeta(WRITE_SCOPE) } : {}),
  }, ({ id, questions, idempotencyKey: requestKey }) =>
    run('write', () => drafts.appendQuestions(context, requestKey, id, questions)));

  server.registerTool('validate_draft', {
    description: 'Run the publication checks on an owned draft and return readiness or an issue to fix.',
    inputSchema: z.strictObject({ id: draftId }),
    outputSchema: toolOutput(draftValidation),
    annotations: read, ...(context.scopes ? { _meta: oauthMeta(READ_SCOPE) } : {}),
  }, ({ id }) => run('read', () => drafts.validate(context, id)));

  return server;
}
