import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { createDraft, patchDraft, draftSummary, draftDetail, draftError, pagination } from '../dist/application/draft-contracts.js';
import { generationRequest, importRequest } from '../dist/application/authoring-import.js';
import { draftEventTypes } from '../dist/application/draft-events.js';

const ref = name => ({ $ref: '#/components/schemas/' + name });
const asSchema = schema => {
  const { $schema, ...document } = z.toJSONSchema(schema);
  return document;
};
const json = schema => ({ 'application/json': { schema } });
const success = data => ({
  type: 'object', required: ['success', 'data', 'requestId'],
  properties: { success: { const: true }, data, requestId: { type: 'string' } },
});
const response = (description, data) => ({
  description,
  headers: { 'X-Request-ID': { schema: { type: 'string' } } },
  content: json(success(data)),
});
const errors = Object.fromEntries([
  [400, 'Invalid request or draft fields'], [401, 'Missing or invalid bearer token'], [403, 'Account access denied'],
  [404, 'Draft unavailable'], [409, 'Draft or idempotency conflict'], [413, 'Request exceeds 32 KB'],
  [415, 'Use application/json for write requests'],
  [422, 'Invalid or duplicate questions'],
  [429, 'Account rate limit reached'], [500, 'Internal service error'], [502, 'Invalid upstream response'],
  [503, 'Dependency unavailable'],
].map(([status, description]) => [status, {
  description, content: json(ref('Error')),
  ...(status === 429 ? { headers: { 'Retry-After': { schema: { type: 'integer', minimum: 1 } } } } : {}),
}]));
const key = {
  in: 'header', name: 'Idempotency-Key', required: true,
  schema: { type: 'string', pattern: '^[A-Za-z0-9._-]{8,128}$' },
  description: 'Scoped to the caller. Reuse with the identical request following an ambiguous response. Retained for 24 hours.',
};
const parameter = (name, schema) => ({ name, schema, in: 'query' });
const list = {
  type: 'object', required: ['drafts', 'pagination'],
  properties: { drafts: { type: 'array', items: ref('DraftSummary') }, pagination: ref('Pagination') },
};
const specification = {
  openapi: '3.1.0',
  info: { title: 'QuizFocus Draft Integration API', version: '1.0.0' },
  servers: [{ url: '/api/v1/ai' }],
  security: [{ bearerAuth: [] }],
  paths: {
    '/imports': { post: {
      operationId: 'importDraft', summary: 'Import validated JSON or a mapped upload as a private draft',
      parameters: [key], requestBody: { required: true, content: json(ref('ImportRequest')) },
      responses: { 201: response('Imported draft', ref('DraftSummary')), ...errors },
    } },
    '/generation': { post: {
      operationId: 'generateDraft', summary: 'Ask a configured provider to generate a private multiple-choice draft',
      parameters: [key], requestBody: { required: true, content: json(ref('GenerationRequest')) },
      responses: { 201: response('Generated draft', ref('DraftSummary')), ...errors },
    } },
    '/webhooks': {
      get: { operationId: 'listWebhooks', summary: 'List active subscriptions', responses: {
        200: response('Active subscriptions', { type: 'array', items: { type: 'object' } }), ...errors,
      } },
      post: { operationId: 'createWebhook', summary: 'Subscribe to private authoring events',
        requestBody: { required: true, content: json({ type: 'object', required: ['url', 'events'],
          additionalProperties: false, properties: { url: { type: 'string', format: 'uri', maxLength: 2048 },
            events: { type: 'array', minItems: 1, maxItems: 3, items: { enum: draftEventTypes } } } }) },
        responses: { 201: response('Subscription and signing secret', { type: 'object', required: ['id', 'events', 'signingSecret'],
          properties: { id: { type: 'string', format: 'uuid' }, events: { type: 'array', items: { enum: draftEventTypes } },
            signingSecret: { type: 'string' } } }), ...errors },
      },
    },
    '/webhooks/{id}': {
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
      delete: { operationId: 'disableWebhook', summary: 'Disable an owned subscription', responses: {
        200: response('Disabled subscription', { type: 'object' }), ...errors,
      } },
    },
    '/webhooks/{id}/deliveries': {
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: { operationId: 'getWebhookDeliveries', summary: 'Read the delivery audit for an owned subscription',
        responses: { 200: response('Delivery history', { type: 'array', items: { type: 'object' } }), ...errors } },
    },
    '/drafts': {
      get: {
        operationId: 'listDrafts', summary: 'List your private drafts',
        parameters: [
          parameter('page', { type: 'integer', minimum: 1, maximum: 9999, default: 1 }),
          parameter('limit', { type: 'integer', minimum: 1, maximum: 100, default: 20 }),
          parameter('kind', { enum: ['quiz', 'challenge'] }),
          parameter('search', { type: 'string', maxLength: 100 }),
        ],
        responses: { 200: response('Draft page', list), ...errors },
      },
      post: {
        operationId: 'createDraft', summary: 'Create a private quiz or challenge draft',
        parameters: [key],
        requestBody: { required: true, content: json(ref('CreateDraft')) },
        responses: { 201: response('Created draft, or original success on replay', ref('DraftSummary')), ...errors },
      },
    },
    '/drafts/{id}': {
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', pattern: '^[A-Fa-f0-9]{24}$' } }],
      get: {
        operationId: 'getDraft', summary: 'Get your draft and its authoring questions',
        responses: { 200: response('Draft with questions', ref('DraftDetail')), ...errors },
      },
      patch: {
        operationId: 'updateDraft', summary: 'Edit supplied fields on your draft',
        description: 'A supplied questions array replaces all draft questions. Omitted fields are retained.',
        parameters: [key],
        requestBody: { required: true, content: json(ref('PatchDraft')) },
        responses: { 200: response('Updated draft, or original success on replay', ref('DraftSummary')), ...errors },
      },
    },
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      CreateDraft: asSchema(createDraft), PatchDraft: { ...asSchema(patchDraft), minProperties: 1 },
      DraftSummary: asSchema(draftSummary), DraftDetail: asSchema(draftDetail),
      Pagination: asSchema(pagination), Error: asSchema(draftError),
      ImportRequest: asSchema(importRequest), GenerationRequest: asSchema(generationRequest),
    },
  },
};
await writeFile(new URL('../openapi.json', import.meta.url), JSON.stringify(specification, null, 2) + '\n');
