import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { errorBody, proxyFailure, sanitizeProxyRequest } from '../services/api-gateway/src/contracts.js';
import { createAttemptRelay } from '../services/quiz-service/src/infrastructure/attemptClient.js';
import { apiFailure } from '../apps/desktop-web/src/api/errorContract.js';

test('independently packaged services use the same closest-match rules', () => {
  const source = service => readFileSync(new URL(`../services/${service}/src/services/closestSearch.js`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  for (const service of ['challenge-service', 'admin-service', 'message-service']) {
    assert.equal(source(service), source('social-service'), service);
  }
});

test('gateway errors preserve legacy clients and expose a classified, correlated contract', () => {
  for (const status of [400,401,403,404,409,413,429,502,503,504,500]) {
    const body = errorBody(status, 'Safe message', 'request-123');
    assert.equal(body.success, false);
    assert.equal(body.message, body.error.message);
    assert.equal(apiFailure({ response: { status, data: body } }).code, body.error.code);
    assert.equal(body.requestId, 'request-123');
  }
  assert.equal(proxyFailure({ code: 'ETIMEDOUT', message: 'private address' }).status, 504);
  assert.equal(proxyFailure({ code: 'ECONNREFUSED' }).status, 502);
  assert.equal(apiFailure({response: {status:403, data:{message:'Legacy permission denial'}}}).message, 'Legacy permission denial');
  assert.equal(apiFailure({}).status, 0);
});

test('edge forwarding removes privileged identity claims and preserves verified credentials', () => {
  const headers = new Map(Object.entries({authorization:'Bearer credential',cookie:'accessToken=credential','x-user-id':'forged','x-internal-token':'forged','x-role':'admin'}));
  sanitizeProxyRequest({ removeHeader: k => headers.delete(k), setHeader: (k,v) => headers.set(k,v) },
    {headers:Object.fromEntries(headers),requestId:'request-123',ip:'127.0.0.1'});
  assert.equal(headers.has('x-user-id'), false); assert.equal(headers.has('x-internal-token'), false); assert.equal(headers.has('x-role'),false);
  assert.equal(headers.get('authorization'),'Bearer credential');
  assert.equal(headers.get('x-forwarded-for'),'127.0.0.1');
});

test('Quiz compatibility transport preserves attempt contracts without forwarding identity assertions', async () => {
  let calls=0;
  const req={method:'PUT', originalUrl:'/api/v1/quiz/!QZ-ABC123/attempt/id/sync-progress',headers:{cookie:'session',authorization:'Bearer token','x-user-id':'forged','x-client-session-id':'guest'},body:{totalElapsedMs:1000}};
  const res=Object.assign(new EventEmitter(),{status(code){this.code=code;return this;},json(body){this.body=body;}});
  const relay=createAttemptRelay({origin:'http://attempt:5004',fetchImpl:async (url,options)=>{
    calls++;assert.equal(url.pathname,req.originalUrl);assert.equal(options.headers['x-user-id'],undefined);
    assert.equal(options.headers.authorization,'Bearer token');assert.equal(options.headers['x-client-session-id'],'guest');
    assert.equal(options.redirect,'manual');assert.deepEqual(JSON.parse(options.body),req.body);
    return {status:200,json:async()=>({success:true,data:{attempt:{status:'in_progress'}}})};
  }});
  await relay(req,res,error=>{throw error;});
  assert.equal(calls,1);assert.equal(res.body.data.attempt.status,'in_progress');
  for (const origin of ['http://user:secret@host','ftp://host','http://host/private','http://host?secret=yes']) assert.throws(()=>createAttemptRelay({origin}));
});

test('compatibility transport returns bounded failures and never retries a write', async () => {
  let calls=0;
  const relay=createAttemptRelay({origin:'http://attempt',timeoutMs:100,fetchImpl:async (url,{signal})=>{
    calls++;await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('private timeout detail'))));
  }});
  let failure;
  await relay({method:'POST',originalUrl:'/api/v1/quiz/id/attempt',headers:{},body:{}},new EventEmitter(),error=>{failure=error;});
  assert.equal(failure.statusCode,504);assert.equal(calls,1);assert.equal(failure.message.includes('private'),false);
});

test('compatibility relay aborts downstream work when the client disconnects', async () => {
  const res=new EventEmitter();
  let aborted=false, propagated=false;
  const relay=createAttemptRelay({origin:'http://attempt',fetchImpl:async (url,{signal})=>{
    return new Promise((resolve,reject)=>{
      signal.addEventListener('abort',()=>{aborted=true;reject(new Error('cancelled'));});
      res.destroyed=true;
      res.emit('close');
    });
  }});
  await relay({method:'POST',originalUrl:'/api/v1/quiz/id/attempt',headers:{},body:{}},res,()=>{propagated=true;});
  assert.equal(aborted,true);assert.equal(propagated,false);
});

test('compatibility relay cannot be redirected by an absolute request target or path traversal', async () => {
  let calls=0;
  const relay=createAttemptRelay({origin:'http://attempt',fetchImpl:async()=>{calls++;}});
  for (const originalUrl of ['http://evil.example/api/v1/quiz/id/attempt','//evil.example/api/v1/quiz/id/attempt','/api/v1/quiz/../../admin']) {
    let error;
    await relay({originalUrl,headers:{}},new EventEmitter(),failure=>{error=failure;});
    assert.equal(error.statusCode,400);
  }
  assert.equal(calls,0);
});

// Helper: Lightweight recursive JSON schema validator for architecture contracts
function resolveContractRef(rootSchema, ref) {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported schema ref: ${ref}`);
  const parts = ref.slice(2).split('/');
  let curr = rootSchema;
  for (const part of parts) {
    if (!curr || typeof curr !== 'object' || !(part in curr)) {
      throw new Error(`Cannot resolve schema ref "${ref}" at part "${part}"`);
    }
    curr = curr[part];
  }
  return curr;
}

function validateContractSchema(schema, data, rootSchema = schema, path = '$') {
  if (schema.$ref) {
    return validateContractSchema(resolveContractRef(rootSchema, schema.$ref), data, rootSchema, path);
  }
  if (schema.allOf) {
    for (let i = 0; i < schema.allOf.length; i++) {
      const err = validateContractSchema(schema.allOf[i], data, rootSchema, `${path}.allOf[${i}]`);
      if (err) return err;
    }
  }
  if (schema.const !== undefined && data !== schema.const) {
    return `${path}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(data)}`;
  }
  if (schema.enum && !schema.enum.includes(data)) {
    return `${path}: value ${JSON.stringify(data)} not in enum ${JSON.stringify(schema.enum)}`;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
    const matches = types.some(t => {
      if (t === 'integer') return Number.isInteger(data);
      if (t === 'number') return typeof data === 'number' && !Number.isNaN(data);
      return actualType === t;
    });
    if (!matches) {
      return `${path}: expected type ${JSON.stringify(schema.type)}, got ${actualType}`;
    }
  }
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      return `${path}: value ${data} < minimum ${schema.minimum}`;
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      return `${path}: value ${data} > maximum ${schema.maximum}`;
    }
  }
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      return `${path}: length ${data.length} < minLength ${schema.minLength}`;
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      return `${path}: length ${data.length} > maxLength ${schema.maxLength}`;
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
      return `${path}: string "${data}" does not match pattern ${schema.pattern}`;
    }
    if (schema.format === 'date-time' && isNaN(Date.parse(data))) {
      return `${path}: string "${data}" is not a valid date-time`;
    }
  }
  if (Array.isArray(data) && schema.items) {
    for (let i = 0; i < data.length; i++) {
      const err = validateContractSchema(schema.items, data[i], rootSchema, `${path}[${i}]`);
      if (err) return err;
    }
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    if (schema.required) {
      for (const reqKey of schema.required) {
        if (!(reqKey in data) || data[reqKey] === undefined) {
          return `${path}: missing required property "${reqKey}"`;
        }
      }
    }
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in data && data[key] !== undefined) {
          const err = validateContractSchema(propSchema, data[key], rootSchema, `${path}.${key}`);
          if (err) return err;
        }
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}));
      for (const key of Object.keys(data)) {
        if (!allowed.has(key)) {
          return `${path}: unrecognized property "${key}" when additionalProperties is false`;
        }
      }
    }
  }
  return null;
}

test('ADR-006 establishes clear domain boundaries, zero question duplication, and security controls', () => {
  const adrStandalonePath = new URL('../docs/adr/ADR-006-marketplace-architecture.md', import.meta.url);
  const adrDigestPath = new URL('../docs/enterprise-upgrade/19-architecture-decisions.md', import.meta.url);

  const adrStandalone = readFileSync(adrStandalonePath, 'utf8');
  const adrDigest = readFileSync(adrDigestPath, 'utf8');

  // Verify ADR title matches requirement
  const expectedTitle = 'ADR-006 — Marketplace Service Ownership Boundaries, Content References, and Entitlements Architecture';
  assert.ok(adrStandalone.includes(expectedTitle), 'Standalone ADR must contain canonical title');
  assert.ok(adrDigest.includes(expectedTitle), 'Digest ADR must contain canonical title');

  // Verify mandatory ADR structure sections in standalone record
  const mandatorySections = [
    '## Status',
    '## Context and problem',
    '## Alternatives',
    '## Decision and reasons',
    '## Consequences',
    '## Migration',
    '## Rollback'
  ];
  for (const section of mandatorySections) {
    assert.ok(adrStandalone.includes(section), `Standalone ADR-006 missing mandatory section: ${section}`);
  }

  // Verify mandatory ADR structure sections in digest record
  const mandatoryDigestSections = [
    '**Status**',
    '**Context and problem**',
    '**Alternatives**',
    '**Decision and reasons**',
    '**Consequences**',
    '**Migration**',
    '**Rollback**'
  ];
  for (const section of mandatoryDigestSections) {
    assert.ok(adrDigest.includes(section), `Digest ADR-006 missing mandatory section: ${section}`);
  }

  // Verify domain ownership boundaries
  assert.ok(adrStandalone.includes('marketplace-service'), 'Must define marketplace-service');
  assert.ok(adrStandalone.includes('quiz-service'), 'Must define quiz-service boundary');
  assert.ok(adrStandalone.includes('attempt-service'), 'Must define attempt-service boundary');
  assert.ok(adrStandalone.includes('port 5013') || adrStandalone.includes('Port 5013'), 'Must designate port 5013 for marketplace');

  // Verify zero question/media duplication invariant
  assert.ok(adrStandalone.includes('Zero Duplication Invariant') || adrStandalone.includes('zero duplication'), 'Must state zero duplication invariant');
  assert.ok(adrStandalone.includes('quizId'), 'Must state content reference via quizId');

  // Verify security boundary controls
  assert.ok(adrStandalone.includes('Creator Ownership Verification') || adrStandalone.includes('creator ownership'), 'Must define creator ownership controls');
  assert.ok(adrStandalone.includes('Safe File & Media Access') || adrStandalone.includes('media-service'), 'Must define safe media access via media-service');
  assert.ok(adrStandalone.includes('Immutable Audit Logging') || adrStandalone.includes('audit logging'), 'Must define immutable audit logging');
  assert.ok(adrStandalone.includes('Idempotency-Key'), 'Must define replay protection with Idempotency-Key');
  assert.ok(adrStandalone.includes('ENTITLEMENT_REQUIRED') || adrStandalone.includes('entitlement'), 'Must define attempt entitlement gate');
});

test('marketplace API contract v1 establishes versioned schemas for catalog, details, orders, checkout, and entitlements', () => {
  const contractPath = new URL('../contracts/marketplace-api.v1.json', import.meta.url);
  const contractRaw = readFileSync(contractPath, 'utf8');
  const contract = JSON.parse(contractRaw);

  // Validate contract metadata
  assert.equal(contract.$id, 'urn:quizfocus:contracts:marketplace-api:v1');
  assert.equal(contract.version, '1.0.0');
  assert.ok(contract.endpoints, 'Contract must define endpoints');

  // Verify required endpoints are all defined
  const requiredEndpoints = [
    'catalogSearch',
    'listingDetails',
    'orderCreate',
    'licenseCheckout',
    'userEntitlements'
  ];
  for (const ep of requiredEndpoints) {
    assert.ok(contract.endpoints[ep], `Endpoint "${ep}" must be defined in API contract`);
  }

  assert.equal(contract.endpoints.catalogSearch.path, '/api/v1/marketplace/catalog');
  assert.equal(contract.endpoints.catalogSearch.method, 'GET');
  assert.equal(contract.endpoints.listingDetails.path, '/api/v1/marketplace/listings/:id');
  assert.equal(contract.endpoints.listingDetails.method, 'GET');
  assert.equal(contract.endpoints.orderCreate.path, '/api/v1/marketplace/orders');
  assert.equal(contract.endpoints.orderCreate.method, 'POST');
  assert.equal(contract.endpoints.licenseCheckout.path, '/api/v1/marketplace/checkout');
  assert.equal(contract.endpoints.licenseCheckout.method, 'POST');
  assert.equal(contract.endpoints.userEntitlements.path, '/api/v1/marketplace/entitlements');
  assert.equal(contract.endpoints.userEntitlements.method, 'GET');

  // Verify Zero Duplication Invariant: CatalogItem has quizId and forbids duplicating questions/options/media
  const catalogItemProps = contract.$defs.CatalogItem.properties;
  assert.ok(catalogItemProps.quizId, 'CatalogItem must have quizId reference');
  assert.equal(catalogItemProps.questions, undefined, 'CatalogItem must NOT duplicate questions');
  assert.equal(catalogItemProps.options, undefined, 'CatalogItem must NOT duplicate options');
  assert.equal(catalogItemProps.explanations, undefined, 'CatalogItem must NOT duplicate explanations');
  assert.equal(contract.$defs.CatalogItem.additionalProperties, false);

  // Test genuine schema validation of CatalogSearchResponse
  const validCatalogResponse = {
    success: true,
    message: 'Catalog search completed',
    data: {
      items: [
        {
          listingId: '507f1f77bcf86cd799439011',
          quizId: '507f191e810c19729de860ea',
          title: 'Cardiology Board Examination Practice',
          description: 'High-yield practice quiz questions for clinical specialists',
          sellerId: '507f1f77bcf86cd799439012',
          price: 49.99,
          currency: 'USD',
          licenseType: 'single_user',
          status: 'active',
          previewQuestionsCount: 5,
          rating: 4.9,
          reviewCount: 30,
          tags: ['cardiology', 'medicine'],
          createdAt: '2026-11-10T10:00:00.000Z',
          updatedAt: '2026-11-10T10:00:00.000Z'
        }
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1
      }
    }
  };
  const catalogErr = validateContractSchema(contract.$defs.CatalogSearchResponse, validCatalogResponse, contract);
  assert.equal(catalogErr, null, `Valid catalog response must pass schema validation: ${catalogErr}`);

  // Test genuine schema validation of OrderCreateRequest & Replay Protection
  const validOrderRequest = {
    listingId: '507f1f77bcf86cd799439011',
    paymentMethod: 'card',
    currency: 'USD',
    billingEmail: 'buyer@example.com'
  };
  const orderReqErr = validateContractSchema(contract.$defs.OrderCreateRequest, validOrderRequest, contract);
  assert.equal(orderReqErr, null, `Valid order request must pass validation: ${orderReqErr}`);

  // Validate Idempotency header requirement
  const validHeaders = { 'Idempotency-Key': '123e4567-e89b-12d3-a456-426614174000' };
  const headersErr = validateContractSchema(contract.$defs.IdempotentRequestHeaders, validHeaders, contract);
  assert.equal(headersErr, null, `Valid idempotency header must pass validation: ${headersErr}`);

  // Negative validation tests: detect invalid payloads genuinely
  const missingIdempotency = {};
  assert.notEqual(
    validateContractSchema(contract.$defs.IdempotentRequestHeaders, missingIdempotency, contract),
    null,
    'Missing Idempotency-Key header must be rejected'
  );

  const invalidOrderMissingCurrency = { listingId: '507f1f77bcf86cd799439011', paymentMethod: 'card' };
  assert.notEqual(
    validateContractSchema(contract.$defs.OrderCreateRequest, invalidOrderMissingCurrency, contract),
    null,
    'Order missing required currency must be rejected'
  );

  const negativePriceItem = {
    ...validCatalogResponse.data.items[0],
    price: -10.00
  };
  assert.notEqual(
    validateContractSchema(contract.$defs.CatalogItem, negativePriceItem, contract),
    null,
    'Negative price must be rejected by schema'
  );

  const invalidLicenseItem = {
    ...validCatalogResponse.data.items[0],
    licenseType: 'invalid_license_tier'
  };
  assert.notEqual(
    validateContractSchema(contract.$defs.CatalogItem, invalidLicenseItem, contract),
    null,
    'Unrecognized licenseType must be rejected by schema'
  );
});

test('marketplace asynchronous events contract v1 defines versioned schemas for listing, order, and entitlement lifecycles', () => {
  const contractPath = new URL('../contracts/marketplace-events.v1.json', import.meta.url);
  const contractRaw = readFileSync(contractPath, 'utf8');
  const contract = JSON.parse(contractRaw);

  // Validate contract metadata
  assert.equal(contract.$id, 'urn:quizfocus:contracts:marketplace-events:v1');
  assert.equal(contract.version, '1.0.0');
  assert.equal(contract.producer, 'marketplace-service');

  // Verify all 5 required asynchronous event types are declared
  const expectedEvents = [
    'marketplace.listing.created.v1',
    'marketplace.listing.updated.v1',
    'marketplace.order.completed.v1',
    'marketplace.entitlement.granted.v1',
    'marketplace.entitlement.revoked.v1'
  ];
  for (const evt of expectedEvents) {
    assert.ok(contract.events[evt], `Event "${evt}" must be defined in events contract`);
  }

  // 1. marketplace.listing.created.v1 validation
  const listingCreatedEvent = {
    eventId: '123e4567-e89b-12d3-a456-426614174001',
    eventType: 'marketplace.listing.created.v1',
    version: '1.0.0',
    timestamp: '2026-11-10T11:00:00.000Z',
    producer: 'marketplace-service',
    data: {
      listingId: '507f1f77bcf86cd799439011',
      quizId: '507f191e810c19729de860ea',
      sellerId: '507f1f77bcf86cd799439012',
      title: 'Neurology Certification MCQ Pack',
      price: 39.99,
      currency: 'USD',
      licenseType: 'single_user',
      status: 'active',
      previewQuestionsCount: 3,
      createdAt: '2026-11-10T11:00:00.000Z'
    }
  };
  const lcErr = validateContractSchema(contract.events['marketplace.listing.created.v1'], listingCreatedEvent, contract);
  assert.equal(lcErr, null, `Valid listing.created event must pass: ${lcErr}`);

  // 2. marketplace.listing.updated.v1 validation
  const listingUpdatedEvent = {
    eventId: '123e4567-e89b-12d3-a456-426614174002',
    eventType: 'marketplace.listing.updated.v1',
    version: '1.0.0',
    timestamp: '2026-11-10T11:05:00.000Z',
    producer: 'marketplace-service',
    data: {
      listingId: '507f1f77bcf86cd799439011',
      quizId: '507f191e810c19729de860ea',
      sellerId: '507f1f77bcf86cd799439012',
      price: 44.99,
      currency: 'USD',
      status: 'active',
      changedFields: ['price'],
      updatedAt: '2026-11-10T11:05:00.000Z'
    }
  };
  const luErr = validateContractSchema(contract.events['marketplace.listing.updated.v1'], listingUpdatedEvent, contract);
  assert.equal(luErr, null, `Valid listing.updated event must pass: ${luErr}`);

  // 3. marketplace.order.completed.v1 validation
  const orderCompletedEvent = {
    eventId: '123e4567-e89b-12d3-a456-426614174003',
    eventType: 'marketplace.order.completed.v1',
    version: '1.0.0',
    timestamp: '2026-11-10T11:10:00.000Z',
    producer: 'marketplace-service',
    data: {
      orderId: '507f1f77bcf86cd799439033',
      listingId: '507f1f77bcf86cd799439011',
      quizId: '507f191e810c19729de860ea',
      buyerId: '507f1f77bcf86cd799439044',
      sellerId: '507f1f77bcf86cd799439012',
      amount: 44.99,
      currency: 'USD',
      licenseType: 'single_user',
      idempotencyKey: 'idemp-key-order-12345678',
      transactionId: 'tx_stripe_999888',
      completedAt: '2026-11-10T11:10:00.000Z'
    }
  };
  const ocErr = validateContractSchema(contract.events['marketplace.order.completed.v1'], orderCompletedEvent, contract);
  assert.equal(ocErr, null, `Valid order.completed event must pass: ${ocErr}`);

  // 4. marketplace.entitlement.granted.v1 validation
  const entitlementGrantedEvent = {
    eventId: '123e4567-e89b-12d3-a456-426614174004',
    eventType: 'marketplace.entitlement.granted.v1',
    version: '1.0.0',
    timestamp: '2026-11-10T11:10:01.000Z',
    producer: 'marketplace-service',
    data: {
      entitlementId: '507f1f77bcf86cd799439055',
      userId: '507f1f77bcf86cd799439044',
      quizId: '507f191e810c19729de860ea',
      listingId: '507f1f77bcf86cd799439011',
      orderId: '507f1f77bcf86cd799439033',
      licenseType: 'single_user',
      grantedAt: '2026-11-10T11:10:01.000Z',
      expiresAt: null
    }
  };
  const egErr = validateContractSchema(contract.events['marketplace.entitlement.granted.v1'], entitlementGrantedEvent, contract);
  assert.equal(egErr, null, `Valid entitlement.granted event must pass: ${egErr}`);

  // 5. marketplace.entitlement.revoked.v1 validation
  const entitlementRevokedEvent = {
    eventId: '123e4567-e89b-12d3-a456-426614174005',
    eventType: 'marketplace.entitlement.revoked.v1',
    version: '1.0.0',
    timestamp: '2026-11-10T11:15:00.000Z',
    producer: 'marketplace-service',
    data: {
      entitlementId: '507f1f77bcf86cd799439055',
      userId: '507f1f77bcf86cd799439044',
      quizId: '507f191e810c19729de860ea',
      reason: 'refund',
      revokedAt: '2026-11-10T11:15:00.000Z',
      revokedBy: '507f1f77bcf86cd799439012'
    }
  };
  const erErr = validateContractSchema(contract.events['marketplace.entitlement.revoked.v1'], entitlementRevokedEvent, contract);
  assert.equal(erErr, null, `Valid entitlement.revoked event must pass: ${erErr}`);

  // Negative validation tests: detect malformed event envelopes and payloads
  const mismatchedEventType = {
    ...listingCreatedEvent,
    eventType: 'marketplace.order.completed.v1'
  };
  assert.notEqual(
    validateContractSchema(contract.events['marketplace.listing.created.v1'], mismatchedEventType, contract),
    null,
    'Mismatched eventType must be rejected'
  );

  const missingProducer = {
    ...orderCompletedEvent,
    producer: undefined
  };
  delete missingProducer.producer;
  assert.notEqual(
    validateContractSchema(contract.events['marketplace.order.completed.v1'], missingProducer, contract),
    null,
    'Missing producer must be rejected'
  );

  const invalidRevokeReason = {
    ...entitlementRevokedEvent,
    data: {
      ...entitlementRevokedEvent.data,
      reason: 'unauthorized_reason_string'
    }
  };
  assert.notEqual(
    validateContractSchema(contract.events['marketplace.entitlement.revoked.v1'], invalidRevokeReason, contract),
    null,
    'Invalid revocation reason must be rejected'
  );

  const negativeOrderAmount = {
    ...orderCompletedEvent,
    data: {
      ...orderCompletedEvent.data,
      amount: -25.00
    }
  };
  assert.notEqual(
    validateContractSchema(contract.events['marketplace.order.completed.v1'], negativeOrderAmount, contract),
    null,
    'Negative order amount must be rejected'
  );
});

